import type { Middleware } from 'koa';
import { AppError } from '../infra/errors.js';
import { extractBearerToken, verifyToken } from '../infra/jwt.js';
import type { BanChecker } from '../services/BanChecker.js';

/**
 * 把封禁查询器挂到请求上下文。路由文件直接引用 authMiddleware，
 * 查询器由应用在最外层统一注入，这样全内存服务可以换成不连库的实现。
 */
export function banCheckerContext(checker: BanChecker): Middleware {
  return async (ctx, next) => {
    ctx.state.banChecker = checker;
    await next();
  };
}

// JWT 认证中间件，将 playerID 注入 ctx.state.player；已挂载封禁查询器时，被封禁账号返回 403
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

  const bans = ctx.state.banChecker as BanChecker | undefined;
  if (bans && (await bans.isBanned(payload.playerId))) {
    throw new AppError('BANNED', 'Account is banned');
  }

  ctx.state.player = { playerId: payload.playerId, nickname: payload.nickname };
  await next();
};
