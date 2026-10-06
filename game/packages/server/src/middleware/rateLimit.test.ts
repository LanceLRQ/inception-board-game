import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Middleware } from 'koa';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../infra/logger.js';
import {
  DEFAULT_HTTP_RATE_LIMIT_PER_MINUTE,
  LIMITER_FAILURE_WARN_INTERVAL_MS,
  createRateLimitGuard,
  resetLimiterFailureWarnState,
  resolveHttpRateLimit,
} from './rateLimit.js';

describe('resolveHttpRateLimit', () => {
  it('缺省时用默认额度', () => {
    expect(resolveHttpRateLimit({})).toBe(DEFAULT_HTTP_RATE_LIMIT_PER_MINUTE);
    expect(DEFAULT_HTTP_RATE_LIMIT_PER_MINUTE).toBe(300);
  });

  it('合法的正整数按配置生效', () => {
    expect(resolveHttpRateLimit({ HTTP_RATE_LIMIT_PER_MINUTE: '120' })).toBe(120);
  });

  it('非法值回落默认额度', () => {
    for (const bad of ['', 'abc', '0', '-5', '1.5', '12x']) {
      expect(resolveHttpRateLimit({ HTTP_RATE_LIMIT_PER_MINUTE: bad })).toBe(
        DEFAULT_HTTP_RATE_LIMIT_PER_MINUTE,
      );
    }
  });
});

describe('createRateLimitGuard', () => {
  const makeCtx = () => ({}) as Parameters<Middleware>[0];

  beforeEach(() => {
    resetLimiterFailureWarnState();
    vi.clearAllMocks();
  });

  it('计数组件抛错时放行并调用下游', async () => {
    const guard = createRateLimitGuard(async () => {
      throw new Error('redis down');
    }, 'limited');
    const next = vi.fn(async () => {});
    await guard(makeCtx(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('连续多次抛错 30 秒内只记一条 warn，过了间隔再记', async () => {
    let t = 1_000_000;
    const guard = createRateLimitGuard(
      async () => {
        throw new Error('redis down');
      },
      'limited',
      () => t,
    );
    for (let i = 0; i < 5; i++) await guard(makeCtx(), async () => {});
    expect(logger.warn).toHaveBeenCalledTimes(1);
    t += LIMITER_FAILURE_WARN_INTERVAL_MS;
    await guard(makeCtx(), async () => {});
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('额度用尽（非 Error 的拒绝结果）仍然 429 且不调用下游', async () => {
    const guard = createRateLimitGuard(async () => {
      throw { remainingPoints: 0, msBeforeNext: 1000 };
    }, 'limited');
    const next = vi.fn(async () => {});
    await expect(guard(makeCtx(), next)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(next).not.toHaveBeenCalled();
  });
});
