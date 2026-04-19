// 乐观锁测试 - 使用 mock Redis

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 每个测试创建独立的 store + mock
function createStoreAndMock() {
  const store = new Map<string, string>();
  return {
    store,
    redis: {
      get: (key: string) => Promise.resolve(store.get(key) ?? null),
      set: (_key: string, val: string) => {
        store.set(_key, val);
        return Promise.resolve('OK');
      },
      multi: () => {
        const ops: Array<{ key: string; val: string }> = [];
        return {
          set(key: string, val: string) {
            ops.push({ key, val });
            return this;
          },
          async exec() {
            for (const op of ops) {
              store.set(op.key, op.val);
            }
            return ops.map(() => [null, 'OK'] as [null, string]);
          },
        };
      },
    },
  };
}

let mockRef: ReturnType<typeof createStoreAndMock>;

vi.mock('../infra/redis.js', () => ({
  createRedisClient: () => mockRef.redis,
}));

import { OptimisticLock } from './optimisticLock.js';

describe('OptimisticLock', () => {
  let lock: OptimisticLock;
  let store: Map<string, string>;

  beforeEach(() => {
    mockRef = createStoreAndMock();
    store = mockRef.store;
    lock = new OptimisticLock();
  });

  describe('getVersion', () => {
    it('returns 0 when key does not exist', async () => {
      expect(await lock.getVersion('test-key')).toBe(0);
    });

    it('returns stored version', async () => {
      store.set('ico:lock:test-key', '5');
      expect(await lock.getVersion('test-key')).toBe(5);
    });
  });

  describe('tryUpdate', () => {
    it('succeeds when version matches', async () => {
      store.set('ico:lock:key1', '3');
      const updateFn = vi.fn().mockResolvedValue(undefined);
      expect(await lock.tryUpdate('key1', 3, updateFn)).toBe(true);
      expect(updateFn).toHaveBeenCalledOnce();
    });

    it('fails when version does not match', async () => {
      store.set('ico:lock:key1', '5');
      const updateFn = vi.fn().mockResolvedValue(undefined);
      expect(await lock.tryUpdate('key1', 3, updateFn)).toBe(false);
      expect(updateFn).not.toHaveBeenCalled();
    });

    it('rolls back on update failure', async () => {
      store.set('ico:lock:key1', '2');
      const updateFn = vi.fn().mockRejectedValue(new Error('fail'));
      expect(await lock.tryUpdate('key1', 2, updateFn)).toBe(false);
      expect(store.get('ico:lock:key1')).toBe('2');
    });

    it('increments version on success', async () => {
      store.set('ico:lock:key1', '1');
      await lock.tryUpdate('key1', 1, vi.fn().mockResolvedValue(undefined));
      expect(store.get('ico:lock:key1')).toBe('2');
    });
  });

  describe('updateWithRetry', () => {
    it('succeeds on first attempt', async () => {
      store.set('ico:lock:key2', '0');
      const updateFn = vi.fn().mockResolvedValue(undefined);
      await lock.updateWithRetry('key2', 3, updateFn);
      expect(updateFn).toHaveBeenCalledOnce();
    });

    it('throws after max retries exhausted', async () => {
      // 模拟并发冲突：每次 get 都返回递增值，getVersion 和 tryUpdate 永远不匹配
      let counter = 0;
      const origGet = mockRef.redis.get;
      mockRef.redis.get = async (key: string) => {
        if (key === 'ico:lock:key4') {
          counter++;
          return String(counter);
        }
        return origGet(key);
      };

      const updateFn = vi.fn().mockResolvedValue(undefined);
      await expect(lock.updateWithRetry('key4', 2, updateFn)).rejects.toThrow('乐观锁冲突');
      expect(updateFn).not.toHaveBeenCalled();
    });

    it('succeeds when version stabilizes after conflict', async () => {
      // 前 2 次 get 返回递增值（冲突），之后稳定
      let counter = 0;
      const origGet = mockRef.redis.get;
      mockRef.redis.get = async (key: string) => {
        if (key === 'ico:lock:key5') {
          counter++;
          if (counter <= 2) return String(counter); // 前两次冲突
          return '10'; // 之后稳定
        }
        return origGet(key);
      };

      const updateFn = vi.fn().mockResolvedValue(undefined);
      await lock.updateWithRetry('key5', 5, updateFn);
      expect(updateFn).toHaveBeenCalledOnce();
    });
  });
});
