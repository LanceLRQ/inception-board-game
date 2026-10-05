import { describe, it, expect } from 'vitest';
import type { Context } from 'koa';
import { authMiddleware } from './auth.js';
import { AppError } from '../infra/errors.js';
import { signToken } from '../infra/jwt.js';

function makeCtx(authorization?: string): Context {
  return { headers: { authorization }, state: {} } as unknown as Context;
}

describe('authMiddleware', () => {
  it('rejects a request without a bearer token', async () => {
    await expect(authMiddleware(makeCtx(), async () => {})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects an invalid token without calling downstream', async () => {
    let called = false;
    await expect(
      authMiddleware(makeCtx('Bearer not-a-token'), async () => {
        called = true;
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(called).toBe(false);
  });

  it('injects the player and calls downstream for a valid token', async () => {
    const token = signToken({ playerId: 'p-1', nickname: 'Ann' });
    const ctx = makeCtx(`Bearer ${token}`);
    let called = false;
    await authMiddleware(ctx, async () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(ctx.state.player).toEqual({ playerId: 'p-1', nickname: 'Ann' });
  });

  it('lets downstream errors through unchanged instead of turning them into 401', async () => {
    const token = signToken({ playerId: 'p-1', nickname: 'Ann' });
    const failure = new AppError('CONFLICT', 'busy');
    await expect(
      authMiddleware(makeCtx(`Bearer ${token}`), async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});
