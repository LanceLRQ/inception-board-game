import type { Middleware } from 'koa';
import type { Redis } from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createRedisClient } from '../infra/redis.js';
import { AppError } from '../infra/errors.js';
import { logger } from '../infra/logger.js';

/** 同一来源地址每分钟的默认请求额度；同一出口下 10 人等待页轮询约 200 次 / 分钟 */
export const DEFAULT_HTTP_RATE_LIMIT_PER_MINUTE = 300;

/** 读取每分钟额度（环境变量 HTTP_RATE_LIMIT_PER_MINUTE）；缺省或非法时用默认值 */
export function resolveHttpRateLimit(env: NodeJS.ProcessEnv): number {
  const raw = env.HTTP_RATE_LIMIT_PER_MINUTE;
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return DEFAULT_HTTP_RATE_LIMIT_PER_MINUTE;
  const n = Number(raw.trim());
  return n > 0 ? n : DEFAULT_HTTP_RATE_LIMIT_PER_MINUTE;
}

let limiter: RateLimiterRedis | null = null;

function getLimiter(): RateLimiterRedis {
  if (!limiter) {
    const redis: Redis = createRedisClient();
    limiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'ico:ratelimit',
      points: resolveHttpRateLimit(process.env),
      duration: 60, // 每分钟
    });
  }
  return limiter;
}

/** 计数故障告警的最小间隔，避免 Redis 宕机期间刷屏 */
export const LIMITER_FAILURE_WARN_INTERVAL_MS = 30_000;

let lastFailureWarnAt = Number.NEGATIVE_INFINITY;

/** 仅测试用：清掉告警节流状态 */
export function resetLimiterFailureWarnState(): void {
  lastFailureWarnAt = Number.NEGATIVE_INFINITY;
}

/**
 * 组装限流中间件。consume 抛出 Error 表示计数组件本身故障（如 Redis 不可用）：
 * 此时放行这次请求并节流告警。限流组件故障不该让不依赖 Redis 的接口也全部不可用，
 * 这与恢复码失败限速的处理一致。额度用尽时 rate-limiter-flexible 抛的是非 Error 的结果对象，仍然返回 429。
 */
export function createRateLimitGuard(
  consume: (ctx: Parameters<Middleware>[0]) => Promise<unknown>,
  message: string,
  now: () => number = Date.now,
): Middleware {
  return async (ctx, next) => {
    try {
      await consume(ctx);
    } catch (err) {
      if (!(err instanceof Error)) throw new AppError('RATE_LIMITED', message);
      const t = now();
      if (t - lastFailureWarnAt >= LIMITER_FAILURE_WARN_INTERVAL_MS) {
        lastFailureWarnAt = t;
        logger.warn({ err }, 'rate limiter unavailable, allowing request');
      }
    }
    await next();
  };
}

// 通用 IP 限流中间件
export const rateLimitMiddleware: Middleware = createRateLimitGuard(
  (ctx) => getLimiter().consume(ctx.ip),
  'Too many requests, please try again later',
);

// 认证用户限流（按 playerId）
export const playerRateLimit = (points: number, duration: number): Middleware => {
  const localLimiter = new RateLimiterRedis({
    storeClient: createRedisClient(),
    keyPrefix: 'ico:ratelimit:player',
    points,
    duration,
  });
  const guard = createRateLimitGuard(
    (ctx) => localLimiter.consume(ctx.state.player.playerId),
    'Too many requests',
  );

  return async (ctx, next) => {
    if (!ctx.state.player?.playerId) {
      await next();
      return;
    }
    await guard(ctx, next);
  };
};
