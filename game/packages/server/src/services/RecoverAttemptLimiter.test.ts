import { describe, expect, it } from 'vitest';
import {
  InMemoryRecoverAttemptLimiter,
  RedisRecoverAttemptLimiter,
  recoverLimitKey,
  type RecoverLimiterRedis,
} from './RecoverAttemptLimiter.js';

describe('InMemoryRecoverAttemptLimiter', () => {
  it('失败满额度后该地址被限制，其他地址不受影响', async () => {
    const l = new InMemoryRecoverAttemptLimiter(() => 0, 3, 1000);
    for (let i = 0; i < 2; i++) await l.recordFailure('1.1.1.1');
    expect(await l.isBlocked('1.1.1.1')).toBe(false);
    await l.recordFailure('1.1.1.1');
    expect(await l.isBlocked('1.1.1.1')).toBe(true);
    expect(await l.isBlocked('2.2.2.2')).toBe(false);
  });

  it('窗口过后恢复', async () => {
    let t = 0;
    const l = new InMemoryRecoverAttemptLimiter(() => t, 1, 1000);
    await l.recordFailure('a');
    expect(await l.isBlocked('a')).toBe(true);
    t = 1000;
    expect(await l.isBlocked('a')).toBe(false);
  });
});

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
  async get(key: string) {
    return this.data.has(key) ? String(this.data.get(key)) : null;
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
}

describe('RedisRecoverAttemptLimiter', () => {
  it('首次失败设置过期，之后只递增；满额度后被限制', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 3, 900);
    await l.recordFailure('ip');
    await l.recordFailure('ip');
    expect(redis.expires).toEqual([['ico:recover:fail:ip', 900]]);
    expect(await l.isBlocked('ip')).toBe(false);
    await l.recordFailure('ip');
    expect(await l.isBlocked('ip')).toBe(true);
  });

  it('首次 expire 失败后，下一次记失败会补设过期，不留永不过期的键', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 3, 900);
    redis.failNextExpire = true;
    await expect(l.recordFailure('ip')).rejects.toThrow('redis down');
    expect(redis.ttls.has('ico:recover:fail:ip')).toBe(false);
    await l.recordFailure('ip');
    expect(redis.ttls.get('ico:recover:fail:ip')).toBe(900);
  });
});

describe('RedisRecoverAttemptLimiter 已达上限的键', () => {
  it('检查时发现计数已满且没有过期时间，就补设过期，不让地址被永久限制', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 3, 900);
    redis.data.set('ico:recover:fail:ip', 3);
    expect(await l.isBlocked('ip')).toBe(true);
    expect(redis.ttls.get('ico:recover:fail:ip')).toBe(900);
  });

  it('已有过期时间的键不被改写', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 3, 900);
    redis.data.set('ico:recover:fail:ip', 3);
    redis.ttls.set('ico:recover:fail:ip', 120);
    expect(await l.isBlocked('ip')).toBe(true);
    expect(redis.ttls.get('ico:recover:fail:ip')).toBe(120);
  });

  it('未达上限时不碰过期时间', async () => {
    const redis = new FakeRedis();
    const l = new RedisRecoverAttemptLimiter(redis, 3, 900);
    redis.data.set('ico:recover:fail:ip', 2);
    expect(await l.isBlocked('ip')).toBe(false);
    expect(redis.expires).toEqual([]);
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
