import Router from '@koa/router';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { AVATAR_PALETTES, generatePixelAvatar } from '@icgame/shared';

const router = new Router();

// GET /players/me - 当前玩家资料
router.get('/players/me', authMiddleware, async (ctx) => {
  const { playerId } = ctx.state.player;
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) throw new AppError('NOT_FOUND', 'Player not found');

  ctx.body = {
    playerId: player.id,
    nickname: player.nickname,
    avatarSeed: player.avatarSeed,
    avatarPalette: player.avatarPalette,
    locale: player.locale,
    createdAt: player.createdAt,
  };
});

// PATCH /players/me - 更新头像 seed / 昵称
const updateMeSchema = z.object({
  avatarSeed: z.string().min(1).max(128).optional(),
  nickname: z.string().min(1).max(50).optional(),
});

router.patch('/players/me', authMiddleware, async (ctx) => {
  const { playerId } = ctx.state.player;
  const body = updateMeSchema.parse(ctx.request.body);

  const data: { avatarSeed?: string; avatarPalette?: string; nickname?: string } = {};
  if (body.avatarSeed !== undefined) {
    // 服务端再算一次 palette 用于持久化展示优化（可选）
    const avatar = generatePixelAvatar(body.avatarSeed);
    data.avatarSeed = body.avatarSeed;
    data.avatarPalette = avatar.paletteId;
  }
  if (body.nickname !== undefined) {
    data.nickname = body.nickname;
  }

  if (Object.keys(data).length === 0) {
    throw new AppError('VALIDATION_ERROR', 'No fields to update');
  }

  const player = await prisma.player.update({
    where: { id: playerId },
    data,
  });

  ctx.body = {
    playerId: player.id,
    nickname: player.nickname,
    avatarSeed: player.avatarSeed,
    avatarPalette: player.avatarPalette,
    availablePalettes: AVATAR_PALETTES.map((p) => p.id),
  };
});

// GET /players/:id/stats - 玩家战绩（公开）
router.get('/players/:id/stats', async (ctx) => {
  const { id } = ctx.params;
  const player = await prisma.player.findUnique({
    where: { id },
    select: { id: true, nickname: true, avatarSeed: true, createdAt: true },
  });
  if (!player) throw new AppError('NOT_FOUND', 'Player not found');

  const matchPlayers = await prisma.matchPlayer.findMany({
    where: { playerId: id },
    select: { won: true, role: true, finalFaction: true, abandoned: true },
  });

  const total = matchPlayers.length;
  const wins = matchPlayers.filter((mp) => mp.won).length;
  const abandoned = matchPlayers.filter((mp) => mp.abandoned).length;

  ctx.body = {
    player: { id: player.id, nickname: player.nickname, avatarSeed: player.avatarSeed },
    stats: { total, wins, losses: total - wins, abandoned, winRate: total > 0 ? wins / total : 0 },
  };
});

// GET /players/me/matches - 我的历史对局（分页）
router.get('/players/me/matches', authMiddleware, async (ctx) => {
  const { playerId } = ctx.state.player;
  const cursor = ctx.query.cursor as string | undefined;
  const limit = Math.min(parseInt(ctx.query.limit as string) || 20, 100);

  const matchPlayers = await prisma.matchPlayer.findMany({
    where: {
      playerId,
      ...(cursor && { matchId: { lt: cursor } }),
    },
    orderBy: { matchId: 'desc' },
    take: limit + 1,
    include: { match: true },
  });

  const hasMore = matchPlayers.length > limit;
  const data = matchPlayers.slice(0, limit);
  const last = data[data.length - 1];

  ctx.body = {
    data: data.map((mp) => ({
      matchId: mp.matchId,
      seat: mp.seat,
      role: mp.role,
      finalFaction: mp.finalFaction,
      won: mp.won,
      abandoned: mp.abandoned,
      startedAt: mp.match.startedAt,
      endedAt: mp.match.endedAt,
      winner: mp.match.winner,
      playerCount: mp.match.playerCount,
    })),
    nextCursor: hasMore && last ? last.matchId : null,
    hasMore,
  };
});

export { router as playersRouter };
