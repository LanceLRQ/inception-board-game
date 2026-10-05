import type { Middleware } from 'koa';
import type { Redis } from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createRedisClient } from '../infra/redis.js';
import { AppError } from '../infra/errors.js';

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

// 通用 IP 限流中间件
export const rateLimitMiddleware: Middleware = async (ctx, next) => {
  const ip = ctx.ip;
  try {
    await getLimiter().consume(ip);
  } catch {
    throw new AppError('RATE_LIMITED', 'Too many requests, please try again later');
  }
  await next();
};

// 认证用户限流（按 playerId）
export const playerRateLimit = (points: number, duration: number): Middleware => {
  const localLimiter = new RateLimiterRedis({
    storeClient: createRedisClient(),
    keyPrefix: 'ico:ratelimit:player',
    points,
    duration,
  });

  return async (ctx, next) => {
    const playerId = ctx.state.player?.playerId;
    if (!playerId) {
      await next();
      return;
    }
    try {
      await localLimiter.consume(playerId);
    } catch {
      throw new AppError('RATE_LIMITED', 'Too many requests');
    }
    await next();
  };
};
