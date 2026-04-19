// ReconnectManager 测试 - mock Redis

import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockRedis() {
  const store = new Map<string, string>();
  let counter = 0;
  return {
    store,
    redis: {
      get: (key: string) => Promise.resolve(store.get(key) ?? null),
      setex: (key: string, _ttl: number, val: string) => {
        store.set(key, val);
        return Promise.resolve('OK');
      },
      incr: (key: string) => {
        counter++;
        const val = counter.toString();
        store.set(key, val);
        return Promise.resolve(counter);
      },
    },
  };
}

let mock: ReturnType<typeof createMockRedis>;

vi.mock('../infra/redis.js', () => ({
  createRedisClient: () => mock.redis,
}));

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { ReconnectManager } from './reconnect.js';

describe('ReconnectManager', () => {
  let rm: ReconnectManager;

  beforeEach(() => {
    mock = createMockRedis();
    rm = new ReconnectManager();
  });

  describe('getEventSeq / incrementEventSeq', () => {
    it('returns 0 when no events exist', async () => {
      expect(await rm.getEventSeq('match1')).toBe(0);
    });

    it('increments and returns new seq', async () => {
      expect(await rm.incrementEventSeq('match1')).toBe(1);
      expect(await rm.incrementEventSeq('match1')).toBe(2);
    });

    it('getEventSeq reads current value after increment', async () => {
      await rm.incrementEventSeq('match1');
      await rm.incrementEventSeq('match1');
      expect(await rm.getEventSeq('match1')).toBe(2);
    });
  });

  describe('isIntentProcessed / markIntentProcessed', () => {
    it('returns false for unprocessed intent', async () => {
      expect(await rm.isIntentProcessed('match1', 'P1', 'intent-1')).toBe(false);
    });

    it('returns true after marking as processed', async () => {
      await rm.markIntentProcessed('match1', 'P1', 'intent-1');
      expect(await rm.isIntentProcessed('match1', 'P1', 'intent-1')).toBe(true);
    });

    it('replaces previous intent (only keeps latest)', async () => {
      await rm.markIntentProcessed('match1', 'P1', 'intent-old');
      await rm.markIntentProcessed('match1', 'P1', 'intent-new');
      expect(await rm.isIntentProcessed('match1', 'P1', 'intent-old')).toBe(false);
      expect(await rm.isIntentProcessed('match1', 'P1', 'intent-new')).toBe(true);
    });

    it('isolates intents per player', async () => {
      await rm.markIntentProcessed('match1', 'P1', 'intent-a');
      expect(await rm.isIntentProcessed('match1', 'P2', 'intent-a')).toBe(false);
    });
  });

  describe('getMissingEvents', () => {
    it('returns no sync needed when client is up-to-date', async () => {
      await rm.incrementEventSeq('match1'); // seq = 1
      const result = await rm.getMissingEvents('match1', 1);
      expect(result.needsFullSync).toBe(false);
      expect(result.fromSeq).toBe(1);
    });

    it('returns incremental range for small gap', async () => {
      // seq → 5
      for (let i = 0; i < 5; i++) await rm.incrementEventSeq('match1');
      const result = await rm.getMissingEvents('match1', 3);
      expect(result.needsFullSync).toBe(false);
      expect(result.fromSeq).toBe(4); // lastEventSeq + 1
    });

    it('requests full sync when gap exceeds 100', async () => {
      // 手动设置高 seq
      mock.store.set('ico:ws:seq:match1', '200');
      const result = await rm.getMissingEvents('match1', 50);
      expect(result.needsFullSync).toBe(true);
      expect(result.fromSeq).toBe(0);
    });

    it('handles client at seq 0', async () => {
      await rm.incrementEventSeq('match1'); // seq = 1
      const result = await rm.getMissingEvents('match1', 0);
      expect(result.needsFullSync).toBe(false);
      expect(result.fromSeq).toBe(1);
    });
  });
});
