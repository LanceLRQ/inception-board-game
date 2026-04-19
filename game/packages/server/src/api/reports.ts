// 举报 API
// 对照：plans/design/08-security-ai.md §8.4b 反作弊与信誉分
//
// POST /matches/:id/report
//   - 鉴权：authMiddleware
//   - zod 校验：targetPlayerId / reason / description?
//   - 调 ReportService：自举/重复/理由校验 + 触发 ReputationService.adjust

import Router from '@koa/router';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import {
  ReputationService,
  type ReputationLevel,
  type ReputationRecord,
  type ReputationStore,
} from '../services/ReputationService.js';
import { ReportService, VALID_REPORT_REASONS } from '../services/ReportService.js';

const router = new Router();

// === Prisma 适配器 ===

const reputationStore: ReputationStore = {
  async get(playerId) {
    const row = await prisma.reputation.findUnique({ where: { playerId } });
    if (!row) return null;
    return {
      playerId: row.playerId,
      score: row.score,
      level: row.level as ReputationLevel,
      updatedAt: row.updatedAt,
    };
  },
  async upsert(playerId, next) {
    const row = await prisma.reputation.upsert({
      where: { playerId },
      create: {
        playerId,
        score: next.score,
        level: next.level,
      },
      update: {
        score: next.score,
        level: next.level,
      },
    });
    return {
      playerId: row.playerId,
      score: row.score,
      level: row.level as ReputationLevel,
      updatedAt: row.updatedAt,
    } satisfies ReputationRecord;
  },
};

const reputationService = new ReputationService(reputationStore);
const reportService = new ReportService(reputationService);

// === 路由 ===

const reportSchema = z.object({
  targetPlayerId: z.string().min(1),
  reason: z.enum(VALID_REPORT_REASONS as unknown as readonly [string, ...string[]]),
  description: z.string().max(500).optional(),
});

router.post('/matches/:id/report', authMiddleware, async (ctx) => {
  const matchID = ctx.params.id ?? '';
  const { playerId } = ctx.state.player;
  const body = reportSchema.parse(ctx.request.body);

  if (!matchID) throw new AppError('VALIDATION_ERROR', 'matchID is required');

  const result = await reportService.submit({
    matchID,
    reporterID: playerId,
    targetID: body.targetPlayerId,
    reason: body.reason as ReturnType<typeof parseReason>,
    ...(body.description ? { description: body.description } : {}),
  });

  if (!result.ok) {
    const statusMap = {
      SELF_REPORT: 400,
      DUPLICATE: 409,
      INVALID_REASON: 400,
      INVALID_TARGET: 400,
    } as const;
    ctx.status = statusMap[result.code];
    ctx.body = { error: { code: result.code } };
    return;
  }

  ctx.status = 201;
  ctx.body = {
    reported: true,
    targetNewScore: result.targetNewScore,
  };
});

function parseReason(r: string): 'cheating' | 'afk' | 'abusive' | 'other' {
  return r as 'cheating' | 'afk' | 'abusive' | 'other';
}

export { router as reportsRouter };
