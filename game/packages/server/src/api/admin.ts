// Admin API - 运营面板（举报审核）
// 对照：plans/design/08-security-ai.md §8.4b 反作弊与信誉分
//
// W22-B Sprint 2：提供举报审核三件套路由。所有端点走 operatorAuthMiddleware 鉴权。
//   GET    /admin/reports              列表（支持 status/matchId/targetId/reporterId/limit/offset）
//   GET    /admin/reports/stats        按 status 聚合计数
//   GET    /admin/reports/:id          单条详情
//   PATCH  /admin/reports/:id          状态流转（pending → resolved/dismissed 或反向重开）

import Router from '@koa/router';
import { z } from 'zod';
import { AppError } from '../infra/errors.js';
import { prisma } from '../infra/postgres.js';
import { createOperatorAuthMiddleware } from '../middleware/operatorAuth.js';
import { PrismaReportArchive } from '../services/PrismaReportArchive.js';
import type { ReportArchive, ReportListFilter } from '../services/ReportService.js';

// === 依赖可注入，便于集成测试用 InMemoryReportArchive 替换 ===
export interface AdminRouterDeps {
  readonly archive?: ReportArchive;
  readonly auth?: ReturnType<typeof createOperatorAuthMiddleware>;
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

  return router;
}

// 默认挂载到 app 的路由（生产用 Prisma + env token）
export const adminRouter: Router = createAdminRouter();
