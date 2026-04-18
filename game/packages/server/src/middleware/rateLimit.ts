import type { Middleware } from 'koa';
import type { Redis } from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createRedisClient } from '../infra/redis.js';
import { AppError } from '../infra/errors.js';

let limiter: RateLimiterRedis | null = null;

function getLimiter(): RateLimiterRedis {
  if (!limiter) {
    const redis: Redis = createRedisClient();
    limiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: 'ico:ratelimit',
      points: 60, // 60 次
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
