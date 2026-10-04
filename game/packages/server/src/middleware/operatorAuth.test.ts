// operatorAuth 中间件 · 单元测试
// W22-B Sprint 2

import { describe, it, expect } from 'vitest';
import { createOperatorAuthMiddleware, hasOperatorToken } from './operatorAuth.js';
import { AppError } from '../infra/errors.js';
import type { Context } from 'koa';

function makeCtx(authHeader?: string): Context {
  return {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
    state: {} as Record<string, unknown>,
  } as unknown as Context;
}

async function runMiddleware(
  mw: ReturnType<typeof createOperatorAuthMiddleware>,
  ctx: Context,
): Promise<{ called: boolean; error: AppError | null }> {
  let called = false;
  try {
    await mw(ctx, async () => {
      called = true;
    });
    return { called, error: null };
  } catch (err) {
    return {
      called,
      error: err instanceof AppError ? err : new AppError('INTERNAL_ERROR', String(err)),
    };
  }
}

describe('hasOperatorToken', () => {
  it('OPERATOR_TOKEN 存在 → true', () => {
    expect(hasOperatorToken({ OPERATOR_TOKEN: 'abc' } as NodeJS.ProcessEnv)).toBe(true);
  });
  it('OPERATOR_TOKEN 缺失 → false', () => {
    expect(hasOperatorToken({} as NodeJS.ProcessEnv)).toBe(false);
  });
  it('OPERATOR_TOKEN 空串 → false', () => {
    expect(hasOperatorToken({ OPERATOR_TOKEN: '' } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('createOperatorAuthMiddleware', () => {
  it('token 未配置 → FORBIDDEN', async () => {
    const mw = createOperatorAuthMiddleware({ token: '' });
    const { called, error } = await runMiddleware(mw, makeCtx('Bearer whatever'));
    expect(called).toBe(false);
    expect(error?.code).toBe('FORBIDDEN');
  });

  it('缺 Authorization 头 → UNAUTHORIZED', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'T' });
    const { called, error } = await runMiddleware(mw, makeCtx(undefined));
    expect(called).toBe(false);
    expect(error?.code).toBe('UNAUTHORIZED');
  });

  it('Bearer 但 token 不匹配 → UNAUTHORIZED', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'right' });
    const { called, error } = await runMiddleware(mw, makeCtx('Bearer wrong'));
    expect(called).toBe(false);
    expect(error?.code).toBe('UNAUTHORIZED');
  });

  it('token 匹配 → next 执行 + ctx.state.operator 注入', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'T', operatorId: 'op-99' });
    const ctx = makeCtx('Bearer T');
    const { called, error } = await runMiddleware(mw, ctx);
    expect(called).toBe(true);
    expect(error).toBeNull();
    expect((ctx.state as { operator: { operatorId: string } }).operator.operatorId).toBe('op-99');
  });

  it('未传 operatorId → 缺省 "operator"', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'T' });
    const ctx = makeCtx('Bearer T');
    // 清理可能被外部 env 污染
    const originalEnv = process.env.OPERATOR_ID;
    delete process.env.OPERATOR_ID;
    try {
      await runMiddleware(mw, ctx);
      expect((ctx.state as { operator: { operatorId: string } }).operator.operatorId).toBe(
        'operator',
      );
    } finally {
      if (originalEnv !== undefined) process.env.OPERATOR_ID = originalEnv;
    }
  });
});
