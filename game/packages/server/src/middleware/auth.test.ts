import { describe, it, expect } from 'vitest';
import type { Context } from 'koa';
import { authMiddleware, banCheckerContext } from './auth.js';
import { InMemoryBanChecker } from '../services/BanChecker.js';
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

describe('authMiddleware · 封禁', () => {
  function ctxWithBans(bans: InMemoryBanChecker, token: string): Context {
    return {
      headers: { authorization: `Bearer ${token}` },
      state: { banChecker: bans },
    } as unknown as Context;
  }
  const token = () => signToken({ playerId: 'p-ban', nickname: 'x' });

  it('被封禁的账号返回 403 BANNED，且不进入下游', async () => {
    const bans = new InMemoryBanChecker();
    bans.ban('p-ban');
    let reached = false;
    await expect(
      authMiddleware(ctxWithBans(bans, token()), async () => {
        reached = true;
      }),
    ).rejects.toMatchObject({ code: 'BANNED', status: 403 });
    expect(reached).toBe(false);
  });

  it('封禁已到期或已解除的账号放行', async () => {
    let now = 1_000;
    const bans = new InMemoryBanChecker(() => now);
    bans.ban('p-ban', new Date(2_000));
    now = 3_000;
    const ctx = ctxWithBans(bans, token());
    await authMiddleware(ctx, async () => {});
    expect(ctx.state.player.playerId).toBe('p-ban');
  });

  it('banCheckerContext 把查询器挂到 ctx.state', async () => {
    const bans = new InMemoryBanChecker();
    const ctx = { state: {} } as unknown as Context;
    await banCheckerContext(bans)(ctx, async () => {});
    expect(ctx.state.banChecker).toBe(bans);
  });
});
