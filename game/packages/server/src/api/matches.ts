import Router from '@koa/router';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { paginationSchema, encodeCursor, decodeCursor } from '../infra/pagination.js';

const router = new Router();

// GET /matches/:id - 对局元信息
router.get('/matches/:id', async (ctx) => {
  const { id } = ctx.params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: { matchPlayers: true },
  });
  if (!match) throw new AppError('NOT_FOUND', 'Match not found');

  ctx.body = {
    id: match.id,
    roomId: match.roomId,
    ruleVariant: match.ruleVariant,
    exEnabled: match.exEnabled,
    expansionEnabled: match.expansionEnabled,
    playerCount: match.playerCount,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    winner: match.winner,
    winReason: match.winReason,
    players: match.matchPlayers.map((mp) => ({
      seat: mp.seat,
      nickname: mp.nickname,
      isBot: mp.isBot,
      role: mp.role,
      finalFaction: mp.finalFaction,
      won: mp.won,
      abandoned: mp.abandoned,
    })),
  };
});

// GET /matches/:id/events - 事件日志（分页）
router.get('/matches/:id/events', authMiddleware, async (ctx) => {
  const { id } = ctx.params;
  const { cursor, limit } = paginationSchema.parse(ctx.query);

  const events = await prisma.matchEvent.findMany({
    where: {
      matchId: id,
      ...(cursor && { moveCounter: { gt: decodeCursor(cursor).moveCounter as number } }),
    },
    orderBy: { moveCounter: 'asc' },
    take: limit + 1,
  });

  const hasMore = events.length > limit;
  const data = events.slice(0, limit);
  const last = data[data.length - 1];

  ctx.body = {
    data: data.map((e) => ({
      moveCounter: e.moveCounter,
      eventKind: e.eventKind,
      payload: e.payload,
      createdAt: e.createdAt,
    })),
    nextCursor: hasMore && last ? encodeCursor({ moveCounter: last.moveCounter }) : null,
    hasMore,
  };
});

// POST /matches/local-upload - 人机对局上传（v1.1 骨架）
router.post('/matches/local-upload', authMiddleware, async (ctx) => {
  // Phase 2 完整实装：反作弊校验 + 事件回放验证
  ctx.status = 201;
  ctx.body = { matchID: null, saved: false, message: 'Local match upload (Phase 2)' };
});

export { router as matchesRouter };
