import { afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import { buildRealtime } from '../bootstrap.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { logger } from '../infra/logger.js';
import { RedisKeys } from '../infra/redisKeys.js';
import { InMemoryMatchArchive } from '../match/MatchArchive.js';
import { InMemoryMatchStore } from '../match/MatchStore.js';
import { DeviceFingerprintService } from './DeviceFingerprintService.js';
import { createPrismaReputationStore } from './PrismaReputationStore.js';
import { ReputationService } from './ReputationService.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
describe.skipIf(!databaseUrl)('设备指纹 · PostgreSQL', () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const fingerprints = new DeviceFingerprintService(prisma);

  afterAll(() => prisma.$disconnect());

  it('并发上报原子累加记录，同设备多账号关联到同一个项目哈希', async () => {
    const players = await prisma.player.createManyAndReturn({
      data: ['指纹登记甲', '指纹登记乙'].map((nickname) => ({ nickname, avatarSeed: 'test' })),
    });
    const [first, second] = players;
    const visitorId = crypto.randomUUID().replaceAll('-', '');
    const where = { playerId: { in: players.map(({ id }) => id) } };
    try {
      await fingerprints.register(first!.id, visitorId);
      const initial = await prisma.deviceFingerprint.findFirstOrThrow({
        where: { playerId: first!.id },
      });
      await Promise.all([
        ...Array.from({ length: 6 }, () => fingerprints.register(first!.id, visitorId)),
        fingerprints.register(second!.id, visitorId),
      ]);
      const records = await prisma.deviceFingerprint.findMany({ where });
      expect(records).toHaveLength(2);
      expect(initial.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(records.map(({ fingerprint }) => fingerprint)).toEqual([
        initial.fingerprint,
        initial.fingerprint,
      ]);
      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            playerId: first!.id,
            firstSeenAt: initial.firstSeenAt,
            seenCount: 7,
            ipSample: null,
            userAgent: null,
          }),
          expect.objectContaining({
            playerId: second!.id,
            seenCount: 1,
            ipSample: null,
            userAgent: null,
          }),
        ]),
      );
      expect(
        +records.find(({ playerId }) => playerId === first!.id)!.lastSeenAt,
      ).toBeGreaterThanOrEqual(+initial.lastSeenAt);
    } finally {
      await prisma.player.deleteMany({ where: { id: { in: players.map(({ id }) => id) } } });
    }
  });

  it('同指纹关联到第 4 个账号时记录弱信号，重复上报不会增加关联账号数', async () => {
    const players = await prisma.player.createManyAndReturn({
      data: Array.from({ length: 4 }, (_, index) => ({
        nickname: `共享设备${index}`,
        avatarSeed: 'test',
      })),
    });
    const visitorId = crypto.randomUUID().replaceAll('-', '');
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      for (const { id } of players.slice(0, 3)) await fingerprints.register(id, visitorId);
      expect(warn).not.toHaveBeenCalled();
      const fourth = players[3]!;
      await Promise.all(
        Array.from({ length: 5 }, () => fingerprints.register(fourth.id, visitorId)),
      );
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        { playerId: fourth.id, linkedAccounts: 4 },
        'device fingerprint associated with multiple accounts',
      );
      expect(await fingerprints.linkedToActiveBans(players.map(({ id }) => id))).toEqual(new Set());
      expect(
        await prisma.player.count({
          where: { id: { in: players.map(({ id }) => id) }, isBanned: true },
        }),
      ).toBe(0);
    } finally {
      warn.mockRestore();
      await prisma.player.deleteMany({ where: { id: { in: players.map(({ id }) => id) } } });
    }
  });

  it.skipIf(!redisUrl)('成桌前复核生效封禁关联，按原票据跨池并在封禁到期后恢复', async () => {
    const prefix = `ico-fingerprint-test-${crypto.randomUUID()}:`;
    const redis = new Redis(redisUrl!, { keyPrefix: prefix });
    const store = createPrismaReputationStore(prisma);
    const reputation = new ReputationService(store);
    const realtime = buildRealtime({
      store: new InMemoryMatchStore(),
      archive: new InMemoryMatchArchive(reputation),
      lobbyRedis: redis,
      lobbyPrisma: prisma,
      identityPrisma: prisma,
      matchmaking: { redis, reputation },
      fingerprints,
      reports: null,
      httpRateLimit: async (_ctx, next) => {
        await next();
      },
    });
    const accounts: Array<{ playerId: string; token: string }> = [];
    try {
      const base = `http://127.0.0.1:${await realtime.start(0)}`;
      const request = async <T>(method: string, path: string, token?: string, body?: unknown) => {
        const response = await fetch(`${base}${path}`, {
          method,
          headers: {
            'content-type': 'application/json',
            ...(token && { authorization: `Bearer ${token}` }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        expect(response.status).toBeLessThan(300);
        return (await response.json()) as T;
      };
      accounts.push(
        ...(await Promise.all(
          ['关联对象', '被封禁', '关联新手', '常规甲', '常规乙', '常规丙', '常规丁'].map(
            (nickname) =>
              request<(typeof accounts)[number]>('POST', '/identity/init', undefined, { nickname }),
          ),
        )),
      );
      const [target, banned, novice, a, b, c, d] = accounts;
      for (const player of [target, a, b, c, d])
        await store.applyDelta(player!.playerId, 12, 50, 3);
      const visitorId = crypto.randomUUID().replaceAll('-', '');
      const register = (user: (typeof accounts)[number]) =>
        request('POST', '/identity/fingerprint', user.token, { fingerprint: visitorId });
      for (const user of [target, banned, novice]) await register(user!);

      const enqueue = (user: (typeof accounts)[number]) =>
        request<{ status: string; ticketId: number }>('POST', '/matchmake', user.token, {
          playerCount: 4,
        });
      const poll = (user: (typeof accounts)[number]) => request('GET', '/matchmake', user.token);
      const original = await enqueue(target!);
      expect(original).toMatchObject({ status: 'queued' });
      expect(original).not.toHaveProperty('lowReputation');
      await enqueue(a!);
      await enqueue(b!);

      await prisma.player.update({
        where: { id: banned!.playerId },
        data: { isBanned: true, banUntil: new Date(Date.now() + 60_000) },
      });
      expect(await enqueue(c!)).toMatchObject({ status: 'queued' });
      expect(realtime.matches.activeCount()).toBe(0);
      expect(await poll(target!)).toEqual({ ...original, lowReputation: true });
      expect(await enqueue(d!)).toMatchObject({ status: 'matched' });
      expect(await reputation.get(target!.playerId)).toMatchObject({ score: 62, level: 'regular' });

      const noviceTicket = await enqueue(novice!);
      expect(noviceTicket).not.toHaveProperty('lowReputation');
      expect(
        await redis.zscore(`${RedisKeys.matchmaking()}:queue:4:classic:novice`, novice!.playerId),
      ).toBe(String(noviceTicket.ticketId));

      await prisma.player.update({
        where: { id: banned!.playerId },
        data: { banUntil: new Date(Date.now() - 1_000) },
      });
      expect(await poll(target!)).toEqual(original);
      expect(
        await redis.zscore(`${RedisKeys.matchmaking()}:queue:4:classic:regular`, target!.playerId),
      ).toBe(String(original.ticketId));

      await prisma.player.update({ where: { id: banned!.playerId }, data: { banUntil: null } });
      expect(await poll(target!)).toEqual({ ...original, lowReputation: true });
      expect(await request('POST', '/rooms', target!.token, { maxPlayers: 4 })).toHaveProperty(
        'code',
      );
      expect(await poll(target!)).toEqual({ status: 'idle' });
    } finally {
      await realtime.stop();
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys.map((key) => key.slice(prefix.length)));
      await redis.quit();
      await prisma.player.deleteMany({
        where: { id: { in: accounts.map(({ playerId }) => playerId) } },
      });
    }
  });
});
