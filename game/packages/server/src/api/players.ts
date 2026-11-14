import Router from '@koa/router';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { prisma } from '../infra/postgres.js';
import { AppError } from '../infra/errors.js';
import { nicknameSchema } from '../infra/nicknameSchema.js';
import { paginationSchema } from '../infra/pagination.js';
import { isUuid } from '../infra/uuid.js';
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
export const updateMeSchema = z.object({
  avatarSeed: z.string().min(1).max(64).optional(),
  nickname: nicknameSchema.optional(),
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
  if (!id || !isUuid(id)) throw new AppError('NOT_FOUND', 'Player not found');
  const player = await prisma.player.findUnique({
    where: { id },
    select: { id: true, nickname: true, avatarSeed: true },
  });
  if (!player) throw new AppError('NOT_FOUND', 'Player not found');

  const outcomes = await prisma.matchPlayer.groupBy({
    by: ['won', 'abandoned', 'isMvp'],
    where: {
      playerId: id,
      match: { endedAt: { not: null } },
      OR: [{ won: { not: null } }, { abandoned: true }],
    },
    _count: { _all: true },
  });
  let wins = 0;
  let losses = 0;
  let abandoned = 0;
  let mvps = 0;
  for (const result of outcomes) {
    const count = result._count._all;
    if (result.abandoned) {
      abandoned += count;
      continue;
    }
    if (result.won) wins += count;
    else losses += count;
    if (result.isMvp) mvps += count;
  }
  const decided = wins + losses;

  ctx.body = {
    player,
    stats: {
      total: decided + abandoned,
      wins,
      losses,
      abandoned,
      mvps,
      winRate: decided ? wins / decided : 0,
    },
  };
});

// GET /players/me/matches - 我的历史对局（分页）
router.get('/players/me/matches', authMiddleware, async (ctx) => {
  const { playerId } = ctx.state.player;
  const { cursor, limit } = paginationSchema.parse(ctx.query);
  const where = { playerId, match: { endedAt: { not: null } } };
  if (cursor !== undefined && !isUuid(cursor))
    throw new AppError('VALIDATION_ERROR', 'invalid cursor');
  const anchor = cursor
    ? await prisma.matchPlayer.findFirst({
        where: { ...where, matchId: cursor },
        select: { seat: true },
      })
    : null;
  if (cursor && !anchor) throw new AppError('VALIDATION_ERROR', 'invalid cursor');

  const matchPlayers = await prisma.matchPlayer.findMany({
    where,
    orderBy: [{ match: { endedAt: 'desc' } }, { matchId: 'desc' }, { seat: 'asc' }],
    ...(cursor &&
      anchor && { cursor: { matchId_seat: { matchId: cursor, seat: anchor.seat } }, skip: 1 }),
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
      isMvp: mp.isMvp,
      score: mp.score,
      mode: mp.match.mode,
      startedAt: mp.match.startedAt,
      endedAt: mp.match.endedAt,
      winner: mp.match.winner,
      playerCount: mp.match.playerCount,
    })),
    nextCursor: hasMore && last ? last.matchId : null,
    hasMore,
  };
});

router.get('/players/me/achievements', authMiddleware, async (ctx) => {
  const { playerId } = ctx.state.player;
  const achievements = await prisma.achievement.findMany({
    where: { playerAchievements: { some: { playerId } } },
    orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      playerAchievements: { where: { playerId }, select: { unlockedAt: true } },
    },
  });
  ctx.body = {
    data: achievements.flatMap(({ playerAchievements, ...achievement }) =>
      playerAchievements.map(({ unlockedAt }) => ({ ...achievement, unlockedAt })),
    ),
  };
});

export { router as playersRouter };
