import Router from '@koa/router';
import { z } from 'zod';
import { MATCH_MAX_PLAYERS, MATCH_MIN_PLAYERS } from '@icgame/shared';
import { AppError } from '../infra/errors.js';
import { isUuid } from '../infra/uuid.js';
import { authMiddleware } from '../middleware/auth.js';
import type { MatchmakingService } from '../services/MatchmakingService.js';

const queueInput = z.object({
  playerCount: z.number().int().min(MATCH_MIN_PLAYERS).max(MATCH_MAX_PLAYERS),
});
const cancelInput = z.object({ ticketId: z.coerce.number().int().positive() });

export function createMatchmakingRouter(service: MatchmakingService): Router {
  const router = new Router();
  router.post('/matchmake', authMiddleware, async (ctx) => {
    const { playerCount } = queueInput.parse(ctx.request.body);
    ctx.set('Cache-Control', 'no-store');
    ctx.body = await service.enqueue(ctx.state.player.playerId, playerCount);
  });
  router.get('/matchmake', authMiddleware, async (ctx) => {
    ctx.set('Cache-Control', 'no-store');
    ctx.body = await service.poll(ctx.state.player.playerId);
  });
  router.delete('/matchmake', authMiddleware, async (ctx) => {
    const { ticketId } = cancelInput.parse(ctx.query);
    ctx.body = await service.cancel(ctx.state.player.playerId, ticketId);
  });
  router.post('/matches/:id/leave', authMiddleware, async (ctx) => {
    const matchId = ctx.params.id!;
    if (!isUuid(matchId)) throw new AppError('NOT_FOUND', 'Match not found');
    await service.leave(matchId, ctx.state.player.playerId);
    ctx.body = { ok: true };
  });
  return router;
}
