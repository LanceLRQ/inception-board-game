import { describe, it, expect, vi } from 'vitest';
import { playersRouter, updateMeSchema } from './players.js';
import { prisma } from '../infra/postgres.js';
import { serveRouter, tokenFor } from '../testing/archiveFixture.js';

vi.mock('../infra/postgres.js', () => ({
  prisma: {
    achievement: { findMany: vi.fn() },
    player: { findUnique: vi.fn() },
    matchPlayer: { groupBy: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

it('公开战绩区分胜负和弃局，胜率只以有效场次为分母', async () => {
  const id = '8b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c01';
  vi.mocked(prisma.player.findUnique).mockResolvedValueOnce({
    id,
    nickname: '测试',
    avatarSeed: 'a',
  } as never);
  vi.mocked(prisma.matchPlayer.groupBy).mockResolvedValueOnce([
    { won: true, abandoned: false, isMvp: true, _count: { _all: 2 } },
    { won: false, abandoned: false, isMvp: false, _count: { _all: 2 } },
    { won: false, abandoned: true, isMvp: false, _count: { _all: 1 } },
  ] as never);
  const server = await serveRouter(playersRouter);
  try {
    expect((await server.get('/players/invalid/stats')).status).toBe(404);
    expect((await server.get(`/players/${id}/stats`)).json).toMatchObject({
      player: { id, nickname: '测试' },
      stats: { total: 5, wins: 2, losses: 2, abandoned: 1, mvps: 2, winRate: 0.5 },
    });
    expect(prisma.matchPlayer.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ playerId: id, match: { endedAt: { not: null } } }),
      }),
    );
  } finally {
    await server.close();
  }
});

it('个人历史只查登录账号的终局，按结束时间和对局编号倒序翻页', async () => {
  const playerId = '8b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c01';
  const cursor = '8b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c02';
  vi.mocked(prisma.matchPlayer.findFirst).mockResolvedValueOnce({ seat: 2 } as never);
  vi.mocked(prisma.matchPlayer.findMany).mockResolvedValueOnce([]);
  const server = await serveRouter(playersRouter);
  try {
    expect((await server.get('/players/me/matches')).status).toBe(401);
    expect(
      (await server.get('/players/me/matches?cursor=invalid', tokenFor(playerId))).status,
    ).toBe(422);
    expect(
      (await server.get(`/players/me/matches?limit=1&cursor=${cursor}`, tokenFor(playerId))).status,
    ).toBe(200);
    expect(prisma.matchPlayer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ playerId, matchId: cursor }),
      }),
    );
    expect(prisma.matchPlayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerId, match: { endedAt: { not: null } } },
        orderBy: [{ match: { endedAt: 'desc' } }, { matchId: 'desc' }, { seat: 'asc' }],
        cursor: { matchId_seat: { matchId: cursor, seat: 2 } },
        skip: 1,
        take: 2,
      }),
    );
  } finally {
    await server.close();
  }
});

describe('PATCH /players/me 请求体', () => {
  it('昵称规范化后写入，超过 20 个字符被拒绝，不再允许 50 字', () => {
    expect(updateMeSchema.parse({ nickname: ' ＡＢ ' }).nickname).toBe('AB');
    expect(() => updateMeSchema.parse({ nickname: 'x'.repeat(21) })).toThrow();
    expect(() => updateMeSchema.parse({ nickname: 'x'.repeat(50) })).toThrow();
  });
  it('违禁词与全空白被拒绝', () => {
    expect(() => updateMeSchema.parse({ nickname: 'system' })).toThrow();
    expect(() => updateMeSchema.parse({ nickname: '   ' })).toThrow();
  });
  it('头像种子长度上限与数据库列宽一致（64）', () => {
    expect(updateMeSchema.parse({ avatarSeed: 'a'.repeat(64) }).avatarSeed).toHaveLength(64);
    expect(() => updateMeSchema.parse({ avatarSeed: 'a'.repeat(65) })).toThrow();
  });
});

it('GET /players/me/achievements 只返回登录账号已解锁的成就', async () => {
  const unlockedAt = new Date('2026-11-14T10:00:00Z');
  vi.mocked(prisma.achievement.findMany).mockResolvedValueOnce([
    {
      id: 'first_kill',
      name: '首杀',
      description: '击杀一名玩家',
      playerAchievements: [{ unlockedAt }],
    },
  ] as never);
  const server = await serveRouter(playersRouter);
  try {
    expect((await server.get('/players/me/achievements')).status).toBe(401);
    const result = await server.get('/players/me/achievements', tokenFor('test-account'));
    expect(result.status).toBe(200);
    expect(result.json).toEqual({
      data: [
        {
          id: 'first_kill',
          name: '首杀',
          description: '击杀一名玩家',
          unlockedAt: unlockedAt.toISOString(),
        },
      ],
    });
    expect(prisma.achievement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerAchievements: { some: { playerId: 'test-account' } } },
        select: expect.objectContaining({
          playerAchievements: { where: { playerId: 'test-account' }, select: { unlockedAt: true } },
        }),
      }),
    );
  } finally {
    await server.close();
  }
});
