import type { Middleware } from 'koa';
import { AppError } from '../infra/errors.js';
import { extractBearerToken, verifyToken } from '../infra/jwt.js';

// JWT 认证中间件，将 playerID 注入 ctx.state.player
export const authMiddleware: Middleware = async (ctx, next) => {
  const token = extractBearerToken(ctx.headers.authorization);
  if (!token) {
    throw new AppError('UNAUTHORIZED', 'Missing or invalid Authorization header');
  }

  try {
    const payload = verifyToken(token);
    ctx.state.player = { playerId: payload.playerId, nickname: payload.nickname };
    await next();
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token');
  }
};
