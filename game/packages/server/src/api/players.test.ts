import { describe, it, expect, vi } from 'vitest';
import { playersRouter, updateMeSchema } from './players.js';
import { prisma } from '../infra/postgres.js';
import { serveRouter, tokenFor } from '../testing/archiveFixture.js';

vi.mock('../infra/postgres.js', () => ({
  prisma: { achievement: { findMany: vi.fn() } },
}));

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
