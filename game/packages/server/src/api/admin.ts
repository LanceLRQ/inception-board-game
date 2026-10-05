// Admin API - 运营面板（举报审核）
//
// 提供举报审核与账号封禁路由。所有端点走运营令牌鉴权。
//   GET    /admin/reports              列表（支持 status/matchId/targetId/reporterId/limit/offset）
//   GET    /admin/reports/stats        按 status 聚合计数
//   GET    /admin/reports/:id          单条详情
//   PATCH  /admin/reports/:id          状态流转（pending → resolved/dismissed 或反向重开）
//   POST   /admin/players/:id/ban      封禁账号（可选到期时间与原因）
//   POST   /admin/players/:id/unban    解除封禁

import Router, { type RouterContext } from '@koa/router';
import { z } from 'zod';
import { AppError } from '../infra/errors.js';
import { logger } from '../infra/logger.js';
import { isUuid } from '../infra/uuid.js';
import { prisma } from '../infra/postgres.js';
import { createOperatorAuthMiddleware } from '../middleware/operatorAuth.js';
import { createBanChecker, type BanChecker } from '../services/BanChecker.js';
import { PrismaReportArchive } from '../services/PrismaReportArchive.js';
import type { ReportArchive, ReportListFilter } from '../services/ReportService.js';

// === 依赖可注入，便于集成测试用 InMemoryReportArchive 替换 ===
/** 封禁接口读写的玩家表；真实实现是 Prisma 客户端，内存服务用内存表 */
export interface AdminPlayerStore {
  findUnique(args: { where: { id: string } }): Promise<{ id: string } | null>;
  update(args: {
    where: { id: string };
    data: { isBanned: boolean; banUntil: Date | null; banReason: string | null };
  }): Promise<unknown>;
}

export interface AdminRouterDeps {
  readonly archive?: ReportArchive;
  readonly auth?: ReturnType<typeof createOperatorAuthMiddleware>;
  /** 玩家表；不给时用全局数据库 */
  readonly players?: AdminPlayerStore;
  /** 封禁缓存；封禁 / 解封后立刻失效。不给时用全局数据库上的 PrismaBanChecker */
  readonly bans?: BanChecker;
  /** 断开某账号现有的全部连接；不给时只改库 */
  readonly disconnectPlayer?: (playerId: string) => number;
}

// === 查询参数校验 ===

const statusSchema = z.enum(['pending', 'resolved', 'dismissed']);

const listQuerySchema = z.object({
  status: statusSchema.optional(),
  matchId: z.string().min(1).optional(),
  targetId: z.string().min(1).optional(),
  reporterId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const patchSchema = z.object({
  status: statusSchema,
  notes: z.string().max(500).optional(),
});

const banSchema = z.object({
  until: z.iso
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .refine((d) => d.getTime() > Date.now(), 'until must be in the future')
    .optional(),
  reason: z.string().max(200).optional(),
});

/** 纯函数：校验后的 query → 领域 filter（供单测直接驱动） */
export function parseListFilter(raw: z.infer<typeof listQuerySchema>): ReportListFilter {
  const f: ReportListFilter = {};
  if (raw.status !== undefined) (f as { status: typeof raw.status }).status = raw.status;
  if (raw.matchId !== undefined) (f as { matchID: string }).matchID = raw.matchId;
  if (raw.targetId !== undefined) (f as { targetID: string }).targetID = raw.targetId;
  if (raw.reporterId !== undefined) (f as { reporterID: string }).reporterID = raw.reporterId;
  if (raw.limit !== undefined) (f as { limit: number }).limit = raw.limit;
  if (raw.offset !== undefined) (f as { offset: number }).offset = raw.offset;
  return f;
}

export function createAdminRouter(deps: AdminRouterDeps = {}): Router {
  const router = new Router();
  const archive: ReportArchive = deps.archive ?? new PrismaReportArchive(prisma);
  const auth = deps.auth ?? createOperatorAuthMiddleware();
  const players: AdminPlayerStore = deps.players ?? (prisma.player as unknown as AdminPlayerStore);
  const bans: BanChecker = deps.bans ?? createBanChecker(prisma);

  /** 写入封禁状态后立刻让缓存失效；只有封禁才断开现有连接，解封不动连接 */
  const applyBan = async (
    ctx: RouterContext,
    data: { isBanned: boolean; banUntil: Date | null; banReason: string | null },
  ): Promise<{ playerId: string; operatorId: string; disconnected: number }> => {
    const playerId = ctx.params.id ?? '';
    if (!playerId) throw new AppError('VALIDATION_ERROR', 'id is required');
    // 账号 ID 是 UUID 列，格式不对一定不存在，不去查库
    if (!isUuid(playerId)) throw new AppError('NOT_FOUND', 'player not found');
    const operatorId = (ctx.state.operator as { operatorId: string } | undefined)?.operatorId;
    if (!operatorId) throw new AppError('UNAUTHORIZED', 'Operator identity missing');
    const target = await players.findUnique({ where: { id: playerId } });
    if (!target) throw new AppError('NOT_FOUND', 'player not found');
    await players.update({ where: { id: playerId }, data });
    bans.invalidate(playerId);
    const disconnected = data.isBanned ? (deps.disconnectPlayer?.(playerId) ?? 0) : 0;
    return { playerId, operatorId, disconnected };
  };

  router.get('/admin/reports', auth, async (ctx) => {
    const parsed = listQuerySchema.safeParse(ctx.query);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid query', { issues: parsed.error.issues });
    }
    const filter = parseListFilter(parsed.data);
    const [items, total] = await Promise.all([
      archive.list(filter),
      archive.count({
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.matchID !== undefined ? { matchID: filter.matchID } : {}),
        ...(filter.targetID !== undefined ? { targetID: filter.targetID } : {}),
        ...(filter.reporterID !== undefined ? { reporterID: filter.reporterID } : {}),
      }),
    ]);
    ctx.body = {
      items,
      total,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    };
  });

  router.get('/admin/reports/stats', auth, async (_ctx) => {
    const [pending, resolved, dismissed, total] = await Promise.all([
      archive.count({ status: 'pending' }),
      archive.count({ status: 'resolved' }),
      archive.count({ status: 'dismissed' }),
      archive.count({}),
    ]);
    _ctx.body = { pending, resolved, dismissed, total };
  });

  router.get('/admin/reports/:id', auth, async (ctx) => {
    const id = ctx.params.id ?? '';
    if (!id) throw new AppError('VALIDATION_ERROR', 'id is required');
    const record = await archive.findById(id);
    if (!record) throw new AppError('NOT_FOUND', 'report not found');
    ctx.body = record;
  });

  router.patch('/admin/reports/:id', auth, async (ctx) => {
    const id = ctx.params.id ?? '';
    if (!id) throw new AppError('VALIDATION_ERROR', 'id is required');
    const parsed = patchSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid body', { issues: parsed.error.issues });
    }
    const operatorId = (ctx.state.operator as { operatorId: string } | undefined)?.operatorId;
    if (!operatorId) {
      // operatorAuth 通过后 state.operator 必存，这里兜底防御
      throw new AppError('UNAUTHORIZED', 'Operator identity missing');
    }
    const updated = await archive.updateStatus(id, {
      status: parsed.data.status,
      resolvedByOperatorID: operatorId,
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    });
    if (!updated) throw new AppError('NOT_FOUND', 'report not found');
    ctx.body = updated;
  });

  router.post('/admin/players/:id/ban', auth, async (ctx) => {
    const parsed = banSchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid body', { issues: parsed.error.issues });
    }
    const until = parsed.data.until ?? null;
    const reason = parsed.data.reason ?? null;
    const { playerId, operatorId, disconnected } = await applyBan(ctx, {
      isBanned: true,
      banUntil: until,
      banReason: reason,
    });
    logger.warn(
      { operatorId, playerId, until: until?.toISOString() ?? null, reason, disconnected },
      'player banned',
    );
    ctx.body = { playerId, isBanned: true, until: until?.toISOString() ?? null };
  });

  router.post('/admin/players/:id/unban', auth, async (ctx) => {
    const { playerId, operatorId } = await applyBan(ctx, {
      isBanned: false,
      banUntil: null,
      banReason: null,
    });
    logger.warn({ operatorId, playerId }, 'player unbanned');
    ctx.body = { playerId, isBanned: false };
  });

  return router;
}
