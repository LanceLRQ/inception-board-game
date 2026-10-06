// 恢复码尝试次数限制：按来源地址与全站两级计数，防止对 8 位恢复码的在线穷举

import { isIPv6 } from 'node:net';
import { logger } from '../infra/logger.js';
import { RedisKeys } from '../infra/redisKeys.js';

/**
 * 计数用的键：IPv4 与 IPv4 映射地址用完整地址；IPv6 取 /64 前缀。
 * 一个普通的 IPv6 用户拥有整个 /64（2^64 个地址），按完整地址计数等于没有限速。
 */
export function recoverLimitKey(ip: string): string {
  const groups = parseIpv6(ip);
  if (!groups) return ip;
  const isMapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (isMapped) {
    const [hi, lo] = [groups[6]!, groups[7]!];
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

/** 把 IPv6 文本展开成 8 个 16 位分组；不是 IPv6 返回 null */
function parseIpv6(raw: string): number[] | null {
  if (!isIPv6(raw)) return null;
  let text = raw.split('%')[0]!;
  // 末尾的点分 IPv4（如 ::ffff:1.2.3.4）换成两个十六进制分组
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = [v4[1], v4[2], v4[3], v4[4]].map(Number) as [
      number,
      number,
      number,
      number,
    ];
    text =
      text.slice(0, v4.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [head = '', tail] = text.split('::');
  const toGroups = (part: string): number[] =>
    part === '' ? [] : part.split(':').map((g) => parseInt(g, 16));
  const front = toGroups(head);
  if (tail === undefined) return front;
  const back = toGroups(tail);
  return [...front, ...new Array<number>(8 - front.length - back.length).fill(0), ...back];
}

/** 窗口长度（秒）：自第一次计数起算 */
export const RECOVER_FAIL_WINDOW_SECONDS = 15 * 60;
/** 单个来源地址在窗口内允许的尝试次数，超过后一律拒绝 */
export const RECOVER_FAIL_LIMIT = 10;
/**
 * 同一个窗口内全站允许的失败尝试次数。
 * 恢复接口不需要指定账号，撞中任何一个有效码都算成功，攻击者换来源地址就能成倍放大尝试量，
 * 所以必须有一个不随来源地址数量增长的上限。
 * 代价是有人持续刷失败时，其他人在这个窗口内也暂时无法恢复：恢复是低频操作，被挡住只是等一会儿，
 * 而账号被撞走不可逆。
 */
export const RECOVER_GLOBAL_FAIL_LIMIT = 300;

export interface RecoverAttemptLimiter {
  /** 占用一次尝试额度；返回 false 表示已超限、这次尝试应被拒绝 */
  tryConsume(ip: string): Promise<boolean>;
  /** 这次尝试最终成功：退还刚才占用的额度（成功的恢复不计入失败次数） */
  refund(ip: string): Promise<void>;
}

interface CounterEntry {
  count: number;
  resetAt: number;
}

/** 进程内实现：全内存服务、测试与 Redis 不可用时的回落 */
export class InMemoryRecoverAttemptLimiter implements RecoverAttemptLimiter {
  private readonly entries = new Map<string, CounterEntry>();
  private global: CounterEntry | null = null;
  private nextPruneAt = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly limit = RECOVER_FAIL_LIMIT,
    private readonly windowMs = RECOVER_FAIL_WINDOW_SECONDS * 1000,
    private readonly globalLimit = RECOVER_GLOBAL_FAIL_LIMIT,
  ) {}

  /** 同步完成「加 1 并返回新值」，单线程下天然原子 */
  private bump(entry: CounterEntry | undefined): CounterEntry {
    if (entry && entry.resetAt > this.now()) {
      entry.count += 1;
      return entry;
    }
    return { count: 1, resetAt: this.now() + this.windowMs };
  }

  private drop(entry: CounterEntry | null | undefined): void {
    if (entry && entry.resetAt > this.now() && entry.count > 0) entry.count -= 1;
  }

  /** 清掉已过期的地址条目；每个窗口最多扫一遍，避免地址表在大量不同来源下只增不减 */
  private prune(): void {
    const now = this.now();
    if (now < this.nextPruneAt) return;
    this.nextPruneAt = now + this.windowMs;
    for (const [ip, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(ip);
    }
  }

  /** 当前保留的地址条目数（供测试） */
  size(): number {
    return this.entries.size;
  }

  async tryConsume(ip: string): Promise<boolean> {
    this.prune();
    const mine = this.bump(this.entries.get(ip));
    this.entries.set(ip, mine);
    // 超限的地址不再碰全站计数，否则一个地址狂刷就能把全站锁住
    if (mine.count > this.limit) return false;
    this.global = this.bump(this.global ?? undefined);
    return this.global.count <= this.globalLimit;
  }

  async refund(ip: string): Promise<void> {
    this.drop(this.entries.get(ip));
    this.drop(this.global);
  }
}

/** Redis 实现用到的命令子集 */
export interface RecoverLimiterRedis {
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

/**
 * 退还额度的脚本：只在计数大于 0 时减一。
 * 用脚本而不是 DECR 后再补救：脚本在 Redis 内原子执行，既不会出现负数，也不会改动键的过期时间。
 */
export const REFUND_SCRIPT =
  "local n = tonumber(redis.call('GET', KEYS[1]) or '0') if n > 0 then return redis.call('DECR', KEYS[1]) end return 0";

/** Redis 实现：多实例共享计数；固定窗口；键没有过期时间就补设，防止某次 expire 失败后该键被永久限制 */
export class RedisRecoverAttemptLimiter implements RecoverAttemptLimiter {
  constructor(
    private readonly redis: RecoverLimiterRedis,
    private readonly limit = RECOVER_FAIL_LIMIT,
    private readonly windowSeconds = RECOVER_FAIL_WINDOW_SECONDS,
    private readonly globalLimit = RECOVER_GLOBAL_FAIL_LIMIT,
  ) {}

  /** INCR 本身原子，返回值就是占用后的计数；不依赖「第一次 incr」设过期，那次 expire 失败后键会永不过期 */
  private async bump(key: string): Promise<number> {
    const n = await this.redis.incr(key);
    if ((await this.redis.ttl(key)) < 0) await this.redis.expire(key, this.windowSeconds);
    return n;
  }

  async tryConsume(ip: string): Promise<boolean> {
    // 超限的地址不再碰全站计数，否则一个地址狂刷就能把全站锁住
    if ((await this.bump(RedisKeys.recoverFailures(ip))) > this.limit) return false;
    return (await this.bump(RedisKeys.recoverFailuresGlobal())) <= this.globalLimit;
  }

  async refund(ip: string): Promise<void> {
    await this.redis.eval(REFUND_SCRIPT, 1, RedisKeys.recoverFailures(ip));
    await this.redis.eval(REFUND_SCRIPT, 1, RedisKeys.recoverFailuresGlobal());
  }
}

/** 主限速器故障时回落到备用限速器：Redis 不可用时改用进程内计数，而不是完全放行 */
export class FallbackRecoverAttemptLimiter implements RecoverAttemptLimiter {
  private degraded = false;

  constructor(
    private readonly primary: RecoverAttemptLimiter,
    private readonly fallback: RecoverAttemptLimiter,
  ) {}

  /** 只在状态切换时记日志，避免主限速器宕机期间每个请求都刷一条 */
  private async run<T>(op: (limiter: RecoverAttemptLimiter) => Promise<T>): Promise<T> {
    try {
      const result = await op(this.primary);
      if (this.degraded) {
        this.degraded = false;
        logger.warn('recover limiter recovered, back to primary');
      }
      return result;
    } catch (err) {
      if (!this.degraded) {
        this.degraded = true;
        logger.warn({ err }, 'recover limiter primary failed, falling back to in-process counting');
      }
      return op(this.fallback);
    }
  }

  tryConsume(ip: string): Promise<boolean> {
    return this.run((l) => l.tryConsume(ip));
  }

  refund(ip: string): Promise<void> {
    return this.run((l) => l.refund(ip));
  }
}
