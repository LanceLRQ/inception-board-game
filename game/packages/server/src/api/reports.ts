// 举报 API
//
// POST /matches/:id/report
//   - 鉴权：authMiddleware
//   - 请求体：{ targetSeat, reason, description? }；目标由座位号在这局的成员里解析，
//     不接受客户端传来的账号 ID，避免举报与本局无关的人
//   - 举报人必须是这局的真人成员；目标必须是另一个真人座位
//   - 去重与扣分由 ReportService 处理：落库（唯一约束判重）与扣信誉分在同一个事务内

import Router from '@koa/router';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma as defaultPrisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { isUuid } from '../infra/uuid.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  REPUTATION_LEVEL_FLOORS,
  REPUTATION_MAX,
  REPUTATION_MIN,
  ReputationService,
  computeNextScore,
  computeReputationLevel,
  type ReputationLevel,
  type ReputationRecord,
  type ReputationStore,
} from '../services/ReputationService.js';
import {
  ReportService,
  VALID_REPORT_REASONS,
  type ReportReason,
} from '../services/ReportService.js';
import { PrismaReportArchive } from '../services/PrismaReportArchive.js';

/** 举报路由查询对局成员所用的数据库操作；真实实现是 Prisma 客户端，测试用内存表 */
export interface ReportsPrisma {
  match: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        matchPlayers: { select: { seat: true; playerId: true; isBot: true } };
      };
    }): Promise<{
      id: string;
      matchPlayers: Array<{ seat: number; playerId: string | null; isBot: boolean }>;
    } | null>;
  };
}

export interface ReportsRouterDeps {
  readonly prisma: ReportsPrisma;
  readonly reportService: ReportService;
}

const reportSchema = z.object({
  targetSeat: z.number().int().min(0),
  reason: z.enum(VALID_REPORT_REASONS as unknown as readonly [string, ...string[]]),
  description: z.string().max(500).optional(),
});

const STATUS_BY_CODE = {
  SELF_REPORT: 400,
  DUPLICATE: 409,
  INVALID_REASON: 400,
  INVALID_TARGET: 400,
} as const;

export function createReportsRouter(deps: ReportsRouterDeps): Router {
  const router = new Router();
  const { prisma, reportService } = deps;

  router.post('/matches/:id/report', authMiddleware, async (ctx) => {
    const matchID = ctx.params.id ?? '';
    const { playerId } = ctx.state.player;
    const parsed = reportSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: { code: 'VALIDATION_ERROR', message: 'Invalid body' } };
      return;
    }
    const body = parsed.data;

    // 对局 ID 在库里是 UUID 列，格式不对一定不存在
    const match = isUuid(matchID)
      ? await prisma.match.findUnique({
          where: { id: matchID },
          select: {
            id: true,
            matchPlayers: { select: { seat: true, playerId: true, isBot: true } },
          },
        })
      : null;
    if (!match) throw new AppError('NOT_FOUND', 'Match not found');

    const isReporterMember = match.matchPlayers.some((p) => !p.isBot && p.playerId === playerId);
    if (!isReporterMember) throw new AppError('FORBIDDEN', 'Only players of this match can report');

    const target = match.matchPlayers.find((p) => p.seat === body.targetSeat);
    // 目标不合法统一回 400（AppError 的校验错误码是 422，这里按举报接口约定直接写响应）
    const rejectTarget = (code: string, message: string): void => {
      ctx.status = 400;
      ctx.body = { error: { code, message } };
    };
    if (!target) return rejectTarget('INVALID_TARGET', 'Target seat not found');
    if (target.isBot || !target.playerId) {
      return rejectTarget('INVALID_TARGET', 'Target seat is not a human player');
    }
    if (target.playerId === playerId) return rejectTarget('SELF_REPORT', 'Cannot report yourself');

    const result = await reportService.submit({
      // 用库里的规范 ID 去重落库：URL 里的写法大小写不定，原样写入会让唯一约束失效
      matchID: match.id,
      reporterID: playerId,
      targetID: target.playerId,
      reason: body.reason as ReportReason,
      ...(body.description ? { description: body.description } : {}),
    });

    if (!result.ok) {
      ctx.status = STATUS_BY_CODE[result.code];
      ctx.body = { error: { code: result.code } };
      return;
    }

    ctx.status = 201;
    ctx.body = {
      reported: true,
      targetNewScore: result.targetNewScore,
    };
  });

  return router;
}

/** 信誉分存储用到的客户端部分；事务客户端同样满足 */
type ReputationPrisma = Pick<PrismaClient, 'reputation' | '$queryRaw'>;

/**
 * 基于 Prisma 的信誉分存储。
 * 加减分是一条 INSERT ... ON CONFLICT DO UPDATE：分数在数据库里原子计算并夹在上下限内，
 * 并发举报不会互相覆盖；等级在同一条语句里按同一组阈值重算。
 */
export function createPrismaReputationStore(prisma: ReputationPrisma): ReputationStore {
  const toRecord = (row: {
    playerId: string;
    score: number;
    level: string;
    updatedAt: Date;
  }): ReputationRecord => ({
    playerId: row.playerId,
    score: row.score,
    level: row.level as ReputationLevel,
    updatedAt: row.updatedAt,
  });
  return {
    async get(playerId) {
      const row = await prisma.reputation.findUnique({ where: { playerId } });
      return row ? toRecord(row) : null;
    },
    async applyDelta(playerId, delta, initialScore) {
      const firstScore = computeNextScore(initialScore, delta);
      const next = Prisma.sql`LEAST(${REPUTATION_MAX}, GREATEST(${REPUTATION_MIN}, "reputation"."score" + ${delta}))`;
      const rows = await prisma.$queryRaw<
        Array<{ playerId: string; score: number; level: string; updatedAt: Date }>
      >`
        INSERT INTO "reputation" ("player_id", "score", "level", "decayed_at", "updated_at")
        VALUES (${playerId}::uuid, ${firstScore}, ${computeReputationLevel(firstScore)}, now(), now())
        ON CONFLICT ("player_id") DO UPDATE SET
          "score" = ${next},
          "level" = CASE
            WHEN ${next} < ${REPUTATION_LEVEL_FLOORS.watched} THEN 'restricted'
            WHEN ${next} < ${REPUTATION_LEVEL_FLOORS.normal} THEN 'watched'
            WHEN ${next} < ${REPUTATION_LEVEL_FLOORS.trusted} THEN 'normal'
            ELSE 'trusted'
          END,
          "updated_at" = now()
        RETURNING "player_id" AS "playerId", "score", "level", "updated_at" AS "updatedAt"`;
      const row = rows[0];
      if (!row) throw new Error('reputation upsert returned no row');
      return toRecord(row);
    },
  };
}

/** 生产依赖：全局数据库客户端 + 数据库举报归档；落库与扣分绑在同一个事务里 */
export function createDefaultReportsDeps(): ReportsRouterDeps {
  const reputation = new ReputationService(createPrismaReputationStore(defaultPrisma));
  return {
    prisma: defaultPrisma as unknown as ReportsPrisma,
    reportService: new ReportService(reputation, {
      archive: new PrismaReportArchive(defaultPrisma),
      runAtomically: (fn) =>
        defaultPrisma.$transaction((tx) =>
          fn({
            archive: new PrismaReportArchive(tx),
            reputation: new ReputationService(createPrismaReputationStore(tx)),
          }),
        ),
    }),
  };
}
