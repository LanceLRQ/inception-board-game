import type { Middleware } from 'koa';
import { AppError } from '../infra/errors.js';
import { extractBearerToken, verifyToken } from '../infra/jwt.js';

// JWT 认证中间件，将 playerID 注入 ctx.state.player
export const authMiddleware: Middleware = async (ctx, next) => {
  const token = extractBearerToken(ctx.headers.authorization);
  if (!token) {
    throw new AppError('UNAUTHORIZED', 'Missing or invalid Authorization header');
  }

  // 只把令牌校验放进 try：下游路由抛出的错误要原样交给错误处理中间件，不能被改写成 401
  let payload: ReturnType<typeof verifyToken>;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token');
  }
  ctx.state.player = { playerId: payload.playerId, nickname: payload.nickname };
  await next();
};
