import Router from '@koa/router';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';

const router = new Router();

// POST /matches/:id/report - 举报（Phase 2 落地完整流程）
const reportSchema = z.object({
  targetPlayerId: z.string(),
  reason: z.enum(['cheating', 'afk', 'abusive', 'other']),
  description: z.string().max(500).optional(),
});

router.post('/matches/:id/report', authMiddleware, async (ctx) => {
  const { id } = ctx.params;
  const { playerId } = ctx.state.player;
  const body = reportSchema.parse(ctx.request.body);

  // Phase 2：完整举报流程 + 管理后台
  // Phase 1：仅记录日志
  void playerId;
  void id;
  void body;

  ctx.status = 201;
  ctx.body = { reported: true, message: 'Report received (Phase 2 full review)' };
});

export { router as reportsRouter };
