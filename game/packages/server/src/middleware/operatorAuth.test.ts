// operatorAuth 中间件 · 单元测试

import { describe, it, expect } from 'vitest';
import {
  createOperatorAuthMiddleware,
  hasOperatorToken,
  isOperatorTokenTooShort,
} from './operatorAuth.js';
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
    expect(hasOperatorToken({ OPERATOR_TOKEN: 'abcdef0123456789' } as NodeJS.ProcessEnv)).toBe(
      true,
    );
  });
  it('OPERATOR_TOKEN 短于 16 个字符 → false，等同未配置', () => {
    expect(hasOperatorToken({ OPERATOR_TOKEN: 'abcdef012345678' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
    expect(hasOperatorToken({ OPERATOR_TOKEN: 'abc' } as NodeJS.ProcessEnv)).toBe(false);
  });
  it('isOperatorTokenTooShort：只有「已配置但太短」才为 true', () => {
    expect(isOperatorTokenTooShort({ OPERATOR_TOKEN: 'abc' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isOperatorTokenTooShort({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isOperatorTokenTooShort({ OPERATOR_TOKEN: '' } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isOperatorTokenTooShort({ OPERATOR_TOKEN: 'abcdef0123456789' } as NodeJS.ProcessEnv),
    ).toBe(false);
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

  it('token 短于 16 个字符 → 视为未配置，即使请求带着同样的短令牌也 FORBIDDEN', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'short' });
    const { called, error } = await runMiddleware(mw, makeCtx('Bearer short'));
    expect(called).toBe(false);
    expect(error?.code).toBe('FORBIDDEN');
  });

  it('缺 Authorization 头 → UNAUTHORIZED', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'token-0123456789ab' });
    const { called, error } = await runMiddleware(mw, makeCtx(undefined));
    expect(called).toBe(false);
    expect(error?.code).toBe('UNAUTHORIZED');
  });

  it('Bearer 但 token 不匹配 → UNAUTHORIZED', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'right-0123456789ab' });
    const { called, error } = await runMiddleware(mw, makeCtx('Bearer wrong'));
    expect(called).toBe(false);
    expect(error?.code).toBe('UNAUTHORIZED');
  });

  it('token 匹配 → next 执行 + ctx.state.operator 注入', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'token-0123456789ab', operatorId: 'op-99' });
    const ctx = makeCtx('Bearer token-0123456789ab');
    const { called, error } = await runMiddleware(mw, ctx);
    expect(called).toBe(true);
    expect(error).toBeNull();
    expect((ctx.state as { operator: { operatorId: string } }).operator.operatorId).toBe('op-99');
  });

  it('未传 operatorId → 缺省 "operator"', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'token-0123456789ab' });
    const ctx = makeCtx('Bearer token-0123456789ab');
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

  it('OPERATOR_ID 为空字符串 → 回落到 "operator"', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'token-0123456789ab' });
    const ctx = makeCtx('Bearer token-0123456789ab');
    const originalEnv = process.env.OPERATOR_ID;
    process.env.OPERATOR_ID = '';
    try {
      await runMiddleware(mw, ctx);
      expect((ctx.state as { operator: { operatorId: string } }).operator.operatorId).toBe(
        'operator',
      );
    } finally {
      if (originalEnv === undefined) delete process.env.OPERATOR_ID;
      else process.env.OPERATOR_ID = originalEnv;
    }
  });

  it('长度不同的 token 拒绝，不抛出长度不一致之类的内部错误', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'right-token-0123456' });
    for (const bad of ['r', 'right-token-0123456-and-more', 'right-token-012345X']) {
      const { called, error } = await runMiddleware(mw, makeCtx(`Bearer ${bad}`));
      expect(called).toBe(false);
      expect(error?.code).toBe('UNAUTHORIZED');
    }
  });

  it('等长但内容不同的 token 拒绝，完全相同的通过', async () => {
    const mw = createOperatorAuthMiddleware({ token: 'abcdef0123456789' });
    expect((await runMiddleware(mw, makeCtx('Bearer abcdef012345678X'))).error?.code).toBe(
      'UNAUTHORIZED',
    );
    expect((await runMiddleware(mw, makeCtx('Bearer abcdef0123456789'))).called).toBe(true);
  });
});
