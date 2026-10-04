// operatorAuth - 运营面板鉴权中间件
// 对照：plans/design/08-security-ai.md §8.4b 反作弊与信誉分
//
// W22-B Sprint 2：简版单 token 鉴权（Phase 5 可升级为多运营账号 + 角色权限）。
//   - Bearer token 来自 `OPERATOR_TOKEN` 环境变量（未配置时**拒绝所有请求**，避免裸奔）
//   - 校验通过后把 `operatorId` 注入 ctx.state.operator（用于 updateStatus 审计）
//   - 支持 `OPERATOR_ID` 环境变量覆盖操作员标识；缺省 'operator'

import type { Middleware } from 'koa';
import { AppError } from '../infra/errors.js';
import { extractBearerToken } from '../infra/jwt.js';

export interface OperatorAuthOptions {
  readonly token?: string;
  readonly operatorId?: string;
}

/** 判定 operator token 是否已配置（便于启动时打 warn） */
export function hasOperatorToken(env: NodeJS.ProcessEnv = process.env): boolean {
  const t = env.OPERATOR_TOKEN;
  return typeof t === 'string' && t.length > 0;
}

export function createOperatorAuthMiddleware(opts: OperatorAuthOptions = {}): Middleware {
  return async (ctx, next) => {
    const expected = opts.token ?? process.env.OPERATOR_TOKEN;
    if (!expected) {
      throw new AppError('FORBIDDEN', 'Operator panel disabled: OPERATOR_TOKEN not configured');
    }

    const token = extractBearerToken(ctx.headers.authorization);
    if (!token) {
      throw new AppError('UNAUTHORIZED', 'Missing or invalid Authorization header');
    }

    // 简化：字符串相等即可（Phase 5 升级为 hash + timing-safe compare）
    if (token !== expected) {
      throw new AppError('UNAUTHORIZED', 'Invalid operator token');
    }

    const operatorId = opts.operatorId ?? process.env.OPERATOR_ID ?? 'operator';
    ctx.state.operator = { operatorId };
    await next();
  };
}

/** 默认单例（懒创建）：在测试中可直接用 createOperatorAuthMiddleware({...}) 注入 */
export const operatorAuthMiddleware: Middleware = (ctx, next) =>
  createOperatorAuthMiddleware()(ctx, next);
