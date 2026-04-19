// HeartbeatManager 测试 - mock Redis

import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    redis: {
      get: (key: string) => Promise.resolve(store.get(key) ?? null),
      setex: (key: string, _ttl: number, val: string) => {
        store.set(key, val);
        return Promise.resolve('OK');
      },
      del: (key: string) => {
        store.delete(key);
        return Promise.resolve(1);
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

import { HeartbeatManager } from './heartbeat.js';

describe('HeartbeatManager', () => {
  let hb: HeartbeatManager;

  beforeEach(() => {
    mock = createMockRedis();
    hb = new HeartbeatManager();
  });

  describe('recordHeartbeat', () => {
    it('stores heartbeat timestamp', async () => {
      await hb.recordHeartbeat('match1', 'P1');
      const key = `ico:ws:hb:match1:P1`;
      expect(mock.store.has(key)).toBe(true);
    });
  });

  describe('isAlive', () => {
    it('returns true for recent heartbeat', async () => {
      mock.store.set('ico:ws:hb:match1:P1', Date.now().toString());
      expect(await hb.isAlive('match1', 'P1')).toBe(true);
    });

    it('returns false when no heartbeat exists', async () => {
      expect(await hb.isAlive('match1', 'P1')).toBe(false);
    });

    it('returns false for stale heartbeat (>30s)', async () => {
      mock.store.set('ico:ws:hb:match1:P1', (Date.now() - 31_000).toString());
      expect(await hb.isAlive('match1', 'P1')).toBe(false);
    });
  });

  describe('getLastHeartbeat', () => {
    it('returns timestamp of last heartbeat', async () => {
      const ts = Date.now();
      mock.store.set('ico:ws:hb:match1:P1', ts.toString());
      expect(await hb.getLastHeartbeat('match1', 'P1')).toBe(ts);
    });

    it('returns null when no heartbeat', async () => {
      expect(await hb.getLastHeartbeat('match1', 'P1')).toBeNull();
    });
  });

  describe('markDisconnected', () => {
    it('removes heartbeat key', async () => {
      const key = 'ico:ws:hb:match1:P1';
      mock.store.set(key, Date.now().toString());
      await hb.markDisconnected('match1', 'P1');
      expect(mock.store.has(key)).toBe(false);
    });

    it('causes isAlive to return false', async () => {
      await hb.recordHeartbeat('match1', 'P1');
      expect(await hb.isAlive('match1', 'P1')).toBe(true);
      await hb.markDisconnected('match1', 'P1');
      expect(await hb.isAlive('match1', 'P1')).toBe(false);
    });
  });
});
