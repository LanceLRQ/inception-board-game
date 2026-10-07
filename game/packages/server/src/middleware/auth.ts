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

// JWT 认证中间件，将玩家信息注入 ctx.state.player；已挂载账号状态查询器时，令牌版本已作废返回 401、被封禁账号返回 403
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
  if (bans) {
    // 先判令牌版本：账号已在别处找回时，旧设备要收到明确的「已作废」而不是笼统的拒绝
    if (!(await bans.isTokenCurrent(payload.playerId, payload.tokenVersion))) {
      throw new AppError('TOKEN_REVOKED', 'Token has been revoked');
    }
    if (await bans.isBanned(payload.playerId)) {
      throw new AppError('BANNED', 'Account is banned');
    }
  }

  ctx.state.player = {
    playerId: payload.playerId,
    nickname: payload.nickname,
    tokenVersion: payload.tokenVersion,
  };
  await next();
};
