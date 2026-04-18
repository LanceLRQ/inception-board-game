import Router from '@koa/router';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { LobbyService } from '../services/LobbyService.js';
import { AppError } from '../infra/errors.js';

const router = new Router();
const lobby = new LobbyService();

// 所有房间路由需要认证
router.use(authMiddleware);

// POST /rooms - 创建房间
const createRoomSchema = z.object({
  maxPlayers: z.number().int().min(3).max(10).default(6),
  ruleVariant: z.string().default('classic'),
  exCardsEnabled: z.boolean().default(false),
  expansionEnabled: z.boolean().default(false),
});

router.post('/rooms', async (ctx) => {
  const body = createRoomSchema.parse(ctx.request.body);
  const { playerId } = ctx.state.player;
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
  const room = await lobby.getRoom(code);
  if (!room) throw new AppError('NOT_FOUND', '房间不存在或已过期');

  ctx.body = {
    id: room.id,
    code: room.code,
    ownerPlayerId: room.ownerPlayerId,
    maxPlayers: room.maxPlayers,
    currentPlayers: room.players.length,
    status: room.status,
    expiresAt: room.expiresAt,
  };
});

// POST /rooms/:id/join
router.post('/rooms/:id/join', async (ctx) => {
  const id = ctx.params.id!;
  const { playerId } = ctx.state.player;
  const room = await lobby.joinRoom(id, playerId);
  ctx.body = { room };
});

// POST /rooms/:id/leave
router.post('/rooms/:id/leave', async (ctx) => {
  const id = ctx.params.id!;
  const { playerId } = ctx.state.player;
  await lobby.leaveRoom(id, playerId);
  ctx.body = { ok: true };
});

// POST /rooms/:id/kick
const kickSchema = z.object({ targetId: z.string() });

router.post('/rooms/:id/kick', async (ctx) => {
  const id = ctx.params.id!;
  const { playerId } = ctx.state.player;
  const { targetId } = kickSchema.parse(ctx.request.body);
  const room = await lobby.kickPlayer(id, playerId, targetId);
  ctx.body = { room };
});

// POST /rooms/:id/fill-ai
const fillAISchema = z.object({ count: z.number().int().min(1).max(9).optional() });

router.post('/rooms/:id/fill-ai', async (ctx) => {
  const id = ctx.params.id!;
  const { playerId } = ctx.state.player;
  const { count } = fillAISchema.parse(ctx.request.body ?? {});
  const room = await lobby.fillAI(id, playerId, count);
  ctx.body = { room };
});

// POST /rooms/:id/start
router.post('/rooms/:id/start', async (ctx) => {
  const id = ctx.params.id!;
  const { playerId } = ctx.state.player;
  const matchId = await lobby.startGame(id, playerId);
  ctx.body = { matchId };
});

export { router as roomsRouter };
