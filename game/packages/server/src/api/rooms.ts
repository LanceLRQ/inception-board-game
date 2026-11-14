import Router from '@koa/router';
import { z } from 'zod';
import { MATCH_MAX_PLAYERS, MATCH_MIN_PLAYERS } from '@icgame/shared';
import { authMiddleware } from '../middleware/auth.js';
import type { LobbyService } from '../services/LobbyService.js';
import type { MatchmakingService } from '../services/MatchmakingService.js';
import { AppError } from '../infra/errors.js';
import { paginationSchema } from '../infra/pagination.js';

const publicRoomsSchema = paginationSchema.extend({
  cursor: z.string().max(128).optional(),
  maxPlayers: z.coerce.number().int().min(MATCH_MIN_PLAYERS).max(MATCH_MAX_PLAYERS).optional(),
});

/** 房间路由；大厅服务由调用方注入 */
export function createRoomsRouter(
  lobby: LobbyService,
  matchmaking?: Pick<MatchmakingService, 'switchToRoom'>,
): Router {
  const router = new Router();

  // 所有房间路由需要认证
  router.use(authMiddleware);

  // POST /rooms - 创建房间
  const createRoomSchema = z.object({
    maxPlayers: z.number().int().min(MATCH_MIN_PLAYERS).max(MATCH_MAX_PLAYERS).default(6),
    ruleVariant: z.string().default('classic'),
    exCardsEnabled: z.boolean().default(false),
    expansionEnabled: z.boolean().default(false),
    isPublic: z.boolean().default(false),
    seriesLength: z.number().int().min(1).max(99).optional(),
  });

  router.get('/rooms/public', async (ctx) => {
    ctx.body = await lobby.listPublicRooms(publicRoomsSchema.parse(ctx.query));
  });

  router.post('/rooms', async (ctx) => {
    const body = createRoomSchema.parse(ctx.request.body);
    const { playerId } = ctx.state.player;
    await matchmaking?.switchToRoom(playerId);
    const room = await lobby.createRoom(playerId, body);

    ctx.status = 201;
    ctx.body = {
      id: room.id,
      code: room.code,
      shortUrl: `/r/${room.code.toLowerCase()}`,
      expiresAt: room.expiresAt,
      ownerPlayerId: room.ownerPlayerId,
      maxPlayers: room.maxPlayers,
      currentPlayers: room.players.length,
      status: room.status,
    };
  });

  // GET /rooms/code/:code - 用房间码查询
  router.get('/rooms/code/:code', async (ctx) => {
    const code = ctx.params.code!;
    const room = await lobby.getRoomForDisplay(code);
    if (!room) throw new AppError('NOT_FOUND', '房间不存在或已过期');

    ctx.body = {
      id: room.id,
      code: room.code,
      ownerPlayerId: room.ownerPlayerId,
      maxPlayers: room.maxPlayers,
      currentPlayers: room.players.length,
      status: room.status,
      matchId: room.matchId,
      series: room.series,
      players: room.players,
      expiresAt: room.expiresAt,
    };
  });

  // POST /rooms/:code/join
  router.post('/rooms/:code/join', async (ctx) => {
    const code = ctx.params.code!;
    const { playerId } = ctx.state.player;
    await matchmaking?.switchToRoom(playerId);
    const room = await lobby.joinRoom(code, playerId);
    ctx.body = { room };
  });

  // POST /rooms/:code/leave
  router.post('/rooms/:code/leave', async (ctx) => {
    const code = ctx.params.code!;
    const { playerId } = ctx.state.player;
    await lobby.leaveRoom(code, playerId);
    ctx.body = { ok: true };
  });

  // POST /rooms/:code/kick
  const kickSchema = z.object({ targetId: z.string() });

  router.post('/rooms/:code/kick', async (ctx) => {
    const code = ctx.params.code!;
    const { playerId } = ctx.state.player;
    const { targetId } = kickSchema.parse(ctx.request.body);
    const room = await lobby.kickPlayer(code, playerId, targetId);
    ctx.body = { room };
  });

  // POST /rooms/:code/fill-ai
  const fillAISchema = z.object({ count: z.number().int().min(1).max(9).optional() });

  router.post('/rooms/:code/fill-ai', async (ctx) => {
    const code = ctx.params.code!;
    const { playerId } = ctx.state.player;
    const { count } = fillAISchema.parse(ctx.request.body ?? {});
    const room = await lobby.fillAI(code, playerId, count);
    ctx.body = { room };
  });

  // POST /rooms/:code/start
  router.post('/rooms/:code/start', async (ctx) => {
    const code = ctx.params.code!;
    const { playerId } = ctx.state.player;
    const matchId = await lobby.startGame(code, playerId);
    ctx.body = { matchId };
  });

  router.post('/rooms/:code/end', async (ctx) => {
    await lobby.endGame(ctx.params.code!, ctx.state.player.playerId);
    ctx.body = { ok: true };
  });

  return router;
}
