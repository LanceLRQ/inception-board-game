// RateGuardService - WS 层 Move 频率/幂等守卫
// 对照：plans/design/07-backend-network.md §7.4 + plans/design/08-security-ai.md §8.4
//
// 功能：
//   - isDuplicate(intentId)：intentId 幂等检测（5 分钟 TTL）
//   - isRateLimited(playerID)：玩家级滑动窗口限流（默认 30 次 / 10s）
//
// 实现：
//   - RedisRateGuard：生产环境，基于 Redis SET NX EX + 滑动窗口计数
//   - InMemoryRateGuard：测试/单机 fallback

import type { Redis } from 'ioredis';
import type { RateGuard } from '@icgame/game-engine';

// === 接口扩展 · 写入副作用 ===

export interface RateGuardMutable extends RateGuard {
  /** 标记 intent 已处理（应在 move 执行成功后调用）*/
  recordIntent(intentId: string): void | Promise<void>;
  /** 记录一次 move 消耗（用于限流计数）*/
  recordMove(playerID: string): void | Promise<void>;
}

// === 内存版 ===

export class InMemoryRateGuard implements RateGuardMutable {
  private readonly intents = new Map<string, number>(); // intentId → expiresAt
  private readonly moves = new Map<string, number[]>(); // playerID → timestamps[]

  constructor(
    private readonly opts: {
      intentTtlMs?: number;
      windowMs?: number;
      maxPerWindow?: number;
    } = {},
  ) {}

  private get intentTtl(): number {
    return this.opts.intentTtlMs ?? 5 * 60 * 1000;
  }
  private get windowMs(): number {
    return this.opts.windowMs ?? 10_000;
  }
  private get maxPerWindow(): number {
    return this.opts.maxPerWindow ?? 30;
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, exp] of this.intents) {
      if (exp < now) this.intents.delete(k);
    }
  }

  isDuplicate(intentId: string): boolean {
    this.prune();
    return this.intents.has(intentId);
  }

  isRateLimited(playerID: string): boolean {
    const now = Date.now();
    const arr = this.moves.get(playerID) ?? [];
    const fresh = arr.filter((t) => now - t < this.windowMs);
    this.moves.set(playerID, fresh);
    return fresh.length >= this.maxPerWindow;
  }

  recordIntent(intentId: string): void {
    this.intents.set(intentId, Date.now() + this.intentTtl);
  }

  recordMove(playerID: string): void {
    const arr = this.moves.get(playerID) ?? [];
    arr.push(Date.now());
    this.moves.set(playerID, arr);
  }

  /** 仅测试用：清空状态 */
  reset(): void {
    this.intents.clear();
    this.moves.clear();
  }
}

// === Redis 版 ===

export class RedisRateGuard implements RateGuardMutable {
  // 缓存同步读：isDuplicate/isRateLimited 是同步接口；
  // 这里通过 "乐观快照 + 异步回写" 策略实现：
  //   - isDuplicate 返回内存快照结果（在 move 接收前已通过 preload 装载）
  //   - 如未装载则保守返回 false，交由 recordIntent 去重
  // 生产使用建议：先调 await preloadIntent(id) 后再走 validator

  private readonly localIntents = new Set<string>();
  private readonly localMoveCounts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly redis: Redis,
    private readonly opts: {
      intentTtlSec?: number;
      windowSec?: number;
      maxPerWindow?: number;
      keyPrefix?: string;
    } = {},
  ) {}

  private get prefix(): string {
    return this.opts.keyPrefix ?? 'ico:ws';
  }
  private get intentTtl(): number {
    return this.opts.intentTtlSec ?? 300;
  }
  private get windowSec(): number {
    return this.opts.windowSec ?? 10;
  }
  private get maxPerWindow(): number {
    return this.opts.maxPerWindow ?? 30;
  }

  private intentKey(id: string): string {
    return `${this.prefix}:intent:${id}`;
  }
  private moveCountKey(pid: string): string {
    return `${this.prefix}:move:${pid}`;
  }

  /** 预加载：在接收 move 前调用（异步），之后 isDuplicate 同步可用 */
  async preloadIntent(intentId: string): Promise<void> {
    const exists = await this.redis.exists(this.intentKey(intentId));
    if (exists) this.localIntents.add(intentId);
  }

  /** 预加载玩家限流计数 */
  async preloadRateCount(playerID: string): Promise<void> {
    const key = this.moveCountKey(playerID);
    const count = await this.redis.get(key);
    const ttl = await this.redis.ttl(key);
    this.localMoveCounts.set(playerID, {
      count: count ? parseInt(count, 10) : 0,
      resetAt: Date.now() + (ttl > 0 ? ttl * 1000 : this.windowSec * 1000),
    });
  }

  isDuplicate(intentId: string): boolean {
    return this.localIntents.has(intentId);
  }

  isRateLimited(playerID: string): boolean {
    const entry = this.localMoveCounts.get(playerID);
    if (!entry) return false;
    return entry.count >= this.maxPerWindow;
  }

  async recordIntent(intentId: string): Promise<void> {
    this.localIntents.add(intentId);
    await this.redis.set(this.intentKey(intentId), '1', 'EX', this.intentTtl);
  }

  async recordMove(playerID: string): Promise<void> {
    const key = this.moveCountKey(playerID);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.windowSec);
    }
    this.localMoveCounts.set(playerID, {
      count,
      resetAt: Date.now() + this.windowSec * 1000,
    });
  }
}

// === 工厂 ===

export function createRateGuard(redis?: Redis): RateGuardMutable {
  return redis ? new RedisRateGuard(redis) : new InMemoryRateGuard();
}
