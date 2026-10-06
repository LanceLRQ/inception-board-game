import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FallbackRecoverAttemptLimiter,
  InMemoryRecoverAttemptLimiter,
  RECOVER_FAIL_LIMIT,
  RECOVER_GLOBAL_FAIL_LIMIT,
  REFUND_SCRIPT,
  RedisRecoverAttemptLimiter,
  recoverLimitKey,
  type RecoverAttemptLimiter,
  type RecoverLimiterRedis,
} from './RecoverAttemptLimiter.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../infra/logger.js';

/** 连续占用 n 次，返回每次的结果 */
async function consumeN(l: RecoverAttemptLimiter, ip: string, n: number): Promise<boolean[]> {
  const out: boolean[] = [];
  for (let i = 0; i < n; i++) out.push(await l.tryConsume(ip));
  return out;
}

/** 只实现限速用到的 Redis 命令的假实现 */
class FakeRedis implements RecoverLimiterRedis {
  data = new Map<string, number>();
  expires: Array<[string, number]> = [];
  ttls = new Map<string, number>();
  /** 为 true 时下一次 expire 失败（模拟 incr 之后 expire 之前的故障） */
  failNextExpire = false;
  async ttl(key: string) {
    if (!this.data.has(key)) return -2;
    return this.ttls.get(key) ?? -1;
  }
  async incr(key: string) {
    const n = (this.data.get(key) ?? 0) + 1;
    this.data.set(key, n);
    return n;
  }
  async expire(key: string, seconds: number) {
    if (this.failNextExpire) {
      this.failNextExpire = false;
      throw new Error('redis down');
    }
    this.expires.push([key, seconds]);
    this.ttls.set(key, seconds);
    return 1;
  }
  /** 只认退还脚本：计数大于 0 才减一 */
  async eval(script: string, _numKeys: number, ...args: string[]) {
    if (script !== REFUND_SCRIPT) throw new Error('unexpected script');
    const key = args[0]!;
    const n = this.data.get(key) ?? 0;
    if (n > 0) this.data.set(key, n - 1);
    return Math.max(0, n - 1);
  }
}

describe.each([
  {
    name: 'InMemoryRecoverAttemptLimiter',
    make: (limit: number, globalLimit: number, clock: { t: number }) =>
      new InMemoryRecoverAttemptLimiter(() => clock.t, limit, 1000, globalLimit),
  },
  {
    name: 'RedisRecoverAttemptLimiter',
    make: (limit: number, globalLimit: number, clock: { t: number }) => {
      // 假 Redis 没有真实时钟：窗口过后由测试清掉键，等价于键过期
      const redis = new FakeRedis();
      const l = new RedisRecoverAttemptLimiter(redis, limit, 900, globalLimit);
      const originalConsume = l.tryConsume.bind(l);
      let seenWindow = 0;
      l.tryConsume = async (ip: string) => {
        const w = Math.floor(clock.t / 1000);
        if (w !== seenWindow) {
          seenWindow = w;
          redis.data.clear();
          redis.ttls.clear();
        }
        return originalConsume(ip);
      };
      return l;
    },
  },
])('$name', ({ make }) => {
  it('第 limit 次通过，第 limit+1 次被拒', async () => {
    const l = make(RECOVER_FAIL_LIMIT, 1000, { t: 0 });
    const results = await consumeN(l, '1.1.1.1', RECOVER_FAIL_LIMIT + 1);
    expect(results.slice(0, RECOVER_FAIL_LIMIT).every(Boolean)).toBe(true);
    expect(results[RECOVER_FAIL_LIMIT]).toBe(false);
  });

  it('不同地址互不影响', async () => {
    const l = make(3, 1000, { t: 0 });
    expect(await consumeN(l, 'a', 4)).toEqual([true, true, true, false]);
    expect(await l.tryConsume('b')).toBe(true);
  });

  it('窗口过后恢复', async () => {
    const clock = { t: 0 };
    const l = make(1, 1000, clock);
    expect(await l.tryConsume('a')).toBe(true);
    expect(await l.tryConsume('a')).toBe(false);
    clock.t = 1000;
    expect(await l.tryConsume('a')).toBe(true);
  });

  it('refund 后额度回来', async () => {
    const l = make(2, 1000, { t: 0 });
    expect(await consumeN(l, 'a', 2)).toEqual([true, true]);
    await l.refund('a');
    expect(await l.tryConsume('a')).toBe(true);
    expect(await l.tryConsume('a')).toBe(false);
  });

  it('refund 不会把计数减到 0 以下', async () => {
    const l = make(2, 1000, { t: 0 });
    await l.refund('a');
    await l.refund('a');
    expect(await consumeN(l, 'a', 3)).toEqual([true, true, false]);
  });

  it('全站上限：不同地址合计超过后返回 false', async () => {
    const l = make(10, 3, { t: 0 });
    expect(await l.tryConsume('a')).toBe(true);
    expect(await l.tryConsume('b')).toBe(true);
    expect(await l.tryConsume('c')).toBe(true);
    expect(await l.tryConsume('d')).toBe(false);
  });

  it('已超限的地址继续请求不会增加全站计数', async () => {
    const l = make(2, 3, { t: 0 });
    // a 占 2 个全站额度后超限，之后狂刷
    expect(await consumeN(l, 'a', 50)).toEqual([true, true, ...new Array<boolean>(48).fill(false)]);
    // 全站只用了 2 个，别的地址还能占到最后 1 个
    expect(await l.tryConsume('b')).toBe(true);
    expect(await l.tryConsume('c')).toBe(false);
  });

  it('refund 同时退还全站额度', async () => {
    const l = make(10, 2, { t: 0 });
    expect(await l.tryConsume('a')).toBe(true);
    expect(await l.tryConsume('b')).toBe(true);
    await l.refund('a');
    expect(await l.tryConsume('c')).toBe(true);
  });

  it('并发占用不会超过额度', async () => {
    const l = make(10, 1000, { t: 0 });
    const results = await Promise.all(Array.from({ length: 200 }, () => l.tryConsume('a')));
    expect(results.filter(Boolean)).toHaveLength(10);
  });
});

describe('默认上限', () => {
  it('单地址 10、全站 300', () => {
    expect(RECOVER_FAIL_LIMIT).toBe(10);
    expect(RECOVER_GLOBAL_FAIL_LIMIT).toBe(300);
  });
});

describe('RedisRecoverAttemptLimiter 过期时间', () => {
  it('地址键与全站键都在首次计数时设置过期，之后只递增', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 3, 900, 100);
    await l.tryConsume('ip');
    await l.tryConsume('ip');
    expect(redis.expires).toEqual([
      ['ico:recover:fail:ip', 900],
      ['ico:recover:fail-global', 900],
    ]);
  });

  it('首次 expire 失败后，下一次占用会补设过期，不留永不过期的键', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 3, 900, 100);
    redis.failNextExpire = true;
    await expect(l.tryConsume('ip')).rejects.toThrow('redis down');
    expect(redis.ttls.has('ico:recover:fail:ip')).toBe(false);
    await l.tryConsume('ip');
    expect(redis.ttls.get('ico:recover:fail:ip')).toBe(900);
    expect(redis.ttls.get('ico:recover:fail-global')).toBe(900);
  });

  it('键已超限且没有过期时间时也补设，不让地址被永久限制', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 3, 900, 100);
    redis.data.set('ico:recover:fail:ip', 5);
    expect(await l.tryConsume('ip')).toBe(false);
    expect(redis.ttls.get('ico:recover:fail:ip')).toBe(900);
  });

  it('已有过期时间的键不被改写', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 3, 900, 100);
    redis.data.set('ico:recover:fail:ip', 1);
    redis.ttls.set('ico:recover:fail:ip', 120);
    await l.tryConsume('ip');
    expect(redis.ttls.get('ico:recover:fail:ip')).toBe(120);
  });

  it('超限的地址不碰全站键', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 1, 900, 100);
    await l.tryConsume('ip');
    await l.tryConsume('ip');
    await l.tryConsume('ip');
    expect(redis.data.get('ico:recover:fail-global')).toBe(1);
  });
});

/** 可控制成败的限速器，记录调用 */
function stubLimiter(): RecoverAttemptLimiter & {
  fail: boolean;
  calls: string[];
} {
  const stub = {
    fail: false,
    calls: [] as string[],
    async tryConsume(ip: string) {
      stub.calls.push(`consume:${ip}`);
      if (stub.fail) throw new Error('redis down');
      return true;
    },
    async refund(ip: string) {
      stub.calls.push(`refund:${ip}`);
      if (stub.fail) throw new Error('redis down');
    },
  };
  return stub;
}

describe('FallbackRecoverAttemptLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('primary 正常时用它的结果，不碰 fallback', async () => {
    const primary = stubLimiter();
    const fallback = stubLimiter();
    const l = new FallbackRecoverAttemptLimiter(primary, fallback);
    expect(await l.tryConsume('a')).toBe(true);
    await l.refund('a');
    expect(primary.calls).toEqual(['consume:a', 'refund:a']);
    expect(fallback.calls).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('primary 抛错时改用 fallback 的结果', async () => {
    const primary = stubLimiter();
    primary.fail = true;
    const fallback = new InMemoryRecoverAttemptLimiter(() => 0, 1, 1000, 100);
    const l = new FallbackRecoverAttemptLimiter(primary, fallback);
    expect(await l.tryConsume('a')).toBe(true);
    expect(await l.tryConsume('a')).toBe(false);
  });

  it('primary 持续故障时 fallback 的 10 次额度照常生效', async () => {
    const primary = stubLimiter();
    primary.fail = true;
    const l = new FallbackRecoverAttemptLimiter(primary, new InMemoryRecoverAttemptLimiter());
    const results = await consumeN(l, 'a', RECOVER_FAIL_LIMIT + 1);
    expect(results.slice(0, RECOVER_FAIL_LIMIT).every(Boolean)).toBe(true);
    expect(results[RECOVER_FAIL_LIMIT]).toBe(false);
  });

  it('refund 在 primary 故障时退到 fallback', async () => {
    const primary = stubLimiter();
    primary.fail = true;
    const l = new FallbackRecoverAttemptLimiter(primary, new InMemoryRecoverAttemptLimiter());
    await consumeN(l, 'a', RECOVER_FAIL_LIMIT);
    await l.refund('a');
    expect(await l.tryConsume('a')).toBe(true);
  });

  it('日志只在状态切换时各记一次', async () => {
    const primary = stubLimiter();
    const l = new FallbackRecoverAttemptLimiter(primary, new InMemoryRecoverAttemptLimiter());
    await l.tryConsume('a');
    expect(logger.warn).toHaveBeenCalledTimes(0);

    primary.fail = true;
    for (let i = 0; i < 5; i++) await l.tryConsume('a');
    expect(logger.warn).toHaveBeenCalledTimes(1);

    primary.fail = false;
    for (let i = 0; i < 5; i++) await l.tryConsume('a');
    expect(logger.warn).toHaveBeenCalledTimes(2);

    primary.fail = true;
    await l.tryConsume('a');
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });
});

describe('recoverLimitKey', () => {
  it('IPv4 用完整地址', () => {
    expect(recoverLimitKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('IPv4 映射地址还原成 IPv4 完整地址', () => {
    expect(recoverLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(recoverLimitKey('::FFFF:cb00:7107')).toBe('203.0.113.7');
  });

  it('IPv6 同一个 /64 前缀归并成同一个键', () => {
    const a = recoverLimitKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    const b = recoverLimitKey('2001:DB8:1:2::1');
    const c = recoverLimitKey('2001:db8:0001:0002:0:0:0:ffff');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('IPv6 不同 /64 前缀互不相同', () => {
    expect(recoverLimitKey('2001:db8:1:3::1')).not.toBe(recoverLimitKey('2001:db8:1:2::1'));
  });

  it('压缩写法与带区域标识的地址也能解析', () => {
    expect(recoverLimitKey('::1')).toBe('0:0:0:0::/64');
    expect(recoverLimitKey('fe80::1%en0')).toBe('fe80:0:0:0::/64');
    expect(recoverLimitKey('2001:db8::')).toBe('2001:db8:0:0::/64');
  });

  it('无法解析的串原样返回', () => {
    expect(recoverLimitKey('unknown')).toBe('unknown');
    expect(recoverLimitKey('')).toBe('');
  });
});

describe('InMemoryRecoverAttemptLimiter 过期条目清理', () => {
  it('窗口过后不再保留各地址的条目', async () => {
    const clock = { t: 0 };
    const limiter = new InMemoryRecoverAttemptLimiter(() => clock.t, 10, 1000, 100_000);
    for (let i = 0; i < 2_000; i++) await limiter.tryConsume(`10.0.${i >> 8}.${i & 0xff}`);
    expect(limiter.size()).toBe(2_000);

    clock.t = 5_000;
    await limiter.tryConsume('192.0.2.1');
    expect(limiter.size()).toBe(1);
  });

  it('窗口内的条目不会被清掉', async () => {
    const clock = { t: 0 };
    const limiter = new InMemoryRecoverAttemptLimiter(() => clock.t, 2, 1000, 100_000);
    for (let i = 0; i < 2_000; i++) await limiter.tryConsume(`10.0.${i >> 8}.${i & 0xff}`);
    await limiter.tryConsume('10.0.0.0');
    expect(await limiter.tryConsume('10.0.0.0')).toBe(false);
  });
});
