// 恢复码失败次数限制：按来源地址计数，防止对 8 位恢复码的在线穷举

import { isIPv6 } from 'node:net';
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

/** 窗口长度（秒）：自该地址第一次失败起算 */
export const RECOVER_FAIL_WINDOW_SECONDS = 15 * 60;
/** 窗口内允许的失败次数，达到后一律拒绝 */
export const RECOVER_FAIL_LIMIT = 10;

export interface RecoverAttemptLimiter {
  /** 该地址当前是否已被限制 */
  isBlocked(ip: string): Promise<boolean>;
  /** 记一次失败；成功不调用，也不清零 */
  recordFailure(ip: string): Promise<void>;
}

/** 进程内实现：全内存服务与测试使用 */
export class InMemoryRecoverAttemptLimiter implements RecoverAttemptLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly limit = RECOVER_FAIL_LIMIT,
    private readonly windowMs = RECOVER_FAIL_WINDOW_SECONDS * 1000,
  ) {}

  private live(ip: string): { count: number; resetAt: number } | null {
    const hit = this.entries.get(ip);
    if (!hit) return null;
    if (hit.resetAt <= this.now()) {
      this.entries.delete(ip);
      return null;
    }
    return hit;
  }

  async isBlocked(ip: string): Promise<boolean> {
    return (this.live(ip)?.count ?? 0) >= this.limit;
  }

  async recordFailure(ip: string): Promise<void> {
    const hit = this.live(ip);
    if (hit) hit.count += 1;
    else this.entries.set(ip, { count: 1, resetAt: this.now() + this.windowMs });
  }
}

/** Redis 实现用到的命令子集 */
export interface RecoverLimiterRedis {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

/** Redis 实现：多实例共享计数；固定窗口；键没有过期时间就补设，防止某次 expire 失败后该地址被永久限制 */
export class RedisRecoverAttemptLimiter implements RecoverAttemptLimiter {
  constructor(
    private readonly redis: RecoverLimiterRedis,
    private readonly limit = RECOVER_FAIL_LIMIT,
    private readonly windowSeconds = RECOVER_FAIL_WINDOW_SECONDS,
  ) {}

  async isBlocked(ip: string): Promise<boolean> {
    const key = RedisKeys.recoverFailures(ip);
    const blocked = Number(await this.redis.get(key)) >= this.limit;
    // 计数已满而键没有过期时间（此前 expire 连续失败）：补设，否则 recordFailure 不会再被调用，地址永久受限
    if (blocked && (await this.redis.ttl(key)) < 0)
      await this.redis.expire(key, this.windowSeconds);
    return blocked;
  }

  async recordFailure(ip: string): Promise<void> {
    const key = RedisKeys.recoverFailures(ip);
    await this.redis.incr(key);
    // 不依赖「第一次 incr」判断：那次 expire 失败后键会永不过期
    if ((await this.redis.ttl(key)) < 0) await this.redis.expire(key, this.windowSeconds);
  }
}
