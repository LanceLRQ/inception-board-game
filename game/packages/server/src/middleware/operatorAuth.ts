// 运营面板鉴权中间件
//
// 简版单令牌鉴权：
//   - Bearer 令牌来自 `OPERATOR_TOKEN` 环境变量（未配置或短于 16 个字符时拒绝所有请求，避免裸奔）
//   - 校验通过后把 `operatorId` 注入 ctx.state.operator（用于审计）
//   - 支持 `OPERATOR_ID` 环境变量覆盖操作员标识；缺省或为空时用 'operator'

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Middleware } from 'koa';
import { AppError } from '../infra/errors.js';
import { extractBearerToken } from '../infra/jwt.js';

export interface OperatorAuthOptions {
  readonly token?: string;
  readonly operatorId?: string;
}

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
  return async (ctx, next) => {
    const expected = opts.token ?? process.env.OPERATOR_TOKEN;
    if (!expected || expected.length < MIN_OPERATOR_TOKEN_LENGTH) {
      throw new AppError(
        'FORBIDDEN',
        'Operator panel disabled: OPERATOR_TOKEN not configured or too short',
      );
    }

    const token = extractBearerToken(ctx.headers.authorization);
    if (!token) {
      throw new AppError('UNAUTHORIZED', 'Missing or invalid Authorization header');
    }

    if (!tokensEqual(token, expected)) {
      throw new AppError('UNAUTHORIZED', 'Invalid operator token');
    }

    const operatorId = opts.operatorId || process.env.OPERATOR_ID || 'operator';
    ctx.state.operator = { operatorId };
    await next();
  };
}

/** 默认单例（懒创建）：在测试中可直接用 createOperatorAuthMiddleware({...}) 注入 */
export const operatorAuthMiddleware: Middleware = (ctx, next) =>
  createOperatorAuthMiddleware()(ctx, next);
