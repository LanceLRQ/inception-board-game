// 运营面板鉴权中间件
//
// 简版单令牌鉴权：
//   - Bearer 令牌来自 `OPERATOR_TOKEN` 环境变量（未配置或短于 16 个字符时拒绝所有请求，避免裸奔）
//   - 校验通过后把 `operatorId` 注入 ctx.state.operator（用于审计）
//   - 支持 `OPERATOR_ID` 环境变量覆盖操作员标识；缺省或为空时用 'operator'
//   - 鉴权失败按来源地址单独限速：窗口内失败次数到上限后一律 429，不再比较令牌

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Middleware } from 'koa';
import { AppError } from '../infra/errors.js';
import { extractBearerToken } from '../infra/jwt.js';

export interface OperatorAuthOptions {
  readonly token?: string;
  readonly operatorId?: string;
  /** 取当前时间（毫秒）；测试注入 */
  readonly now?: () => number;
}

/** 同一来源地址在一个窗口内允许的鉴权失败次数 */
export const OPERATOR_FAIL_LIMIT = 10;
/** 失败计数的窗口：从第一次失败起算 */
export const OPERATOR_FAIL_WINDOW_MS = 15 * 60 * 1000;
/** 计数表超过这么多条时顺手清掉过期的，防止被大量来源地址撑大 */
const FAIL_PRUNE_THRESHOLD = 1000;

/** 运营令牌最短长度：接口经反代对公网可达，唯一的保护就是这个静态令牌 */
export const MIN_OPERATOR_TOKEN_LENGTH = 16;

/** 令牌已配置且长度达标；太短的令牌视为未配置（运营接口关闭） */
export function hasOperatorToken(env: NodeJS.ProcessEnv = process.env): boolean {
  const t = env.OPERATOR_TOKEN;
  return typeof t === 'string' && t.length >= MIN_OPERATOR_TOKEN_LENGTH;
}

/** 配了令牌但太短：启动时据此打 warn，提示运营接口因此保持关闭 */
export function isOperatorTokenTooShort(env: NodeJS.ProcessEnv = process.env): boolean {
  const t = env.OPERATOR_TOKEN;
  return typeof t === 'string' && t.length > 0 && t.length < MIN_OPERATOR_TOKEN_LENGTH;
}

/** 恒定时间比较：先各取 SHA-256 摘要得到等长输入，避免按长度或前缀逐位泄露令牌 */
function tokensEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

export function createOperatorAuthMiddleware(opts: OperatorAuthOptions = {}): Middleware {
  const now = opts.now ?? Date.now;
  const failures = new Map<string, { count: number; resetAt: number }>();
  const fail = (ip: string, message: string): never => {
    const t = now();
    if (failures.size > FAIL_PRUNE_THRESHOLD) {
      for (const [key, f] of failures) if (t >= f.resetAt) failures.delete(key);
    }
    const f = failures.get(ip);
    if (f && t < f.resetAt) f.count += 1;
    else failures.set(ip, { count: 1, resetAt: t + OPERATOR_FAIL_WINDOW_MS });
    throw new AppError('UNAUTHORIZED', message);
  };

  return async (ctx, next) => {
    const expected = opts.token ?? process.env.OPERATOR_TOKEN;
    if (!expected || expected.length < MIN_OPERATOR_TOKEN_LENGTH) {
      throw new AppError(
        'FORBIDDEN',
        'Operator panel disabled: OPERATOR_TOKEN not configured or too short',
      );
    }

    const ip = ctx.ip;
    const f = failures.get(ip);
    if (f && now() >= f.resetAt) failures.delete(ip);
    else if (f && f.count >= OPERATOR_FAIL_LIMIT) {
      throw new AppError('RATE_LIMITED', 'Too many failed operator logins');
    }

    const token = extractBearerToken(ctx.headers.authorization);
    if (!token) return fail(ip, 'Missing or invalid Authorization header');
    if (!tokensEqual(token, expected)) return fail(ip, 'Invalid operator token');

    const operatorId = opts.operatorId || process.env.OPERATOR_ID || 'operator';
    ctx.state.operator = { operatorId };
    await next();
  };
}

/** 默认单例（懒创建）：在测试中可直接用 createOperatorAuthMiddleware({...}) 注入 */
export const operatorAuthMiddleware: Middleware = (ctx, next) =>
  createOperatorAuthMiddleware()(ctx, next);
