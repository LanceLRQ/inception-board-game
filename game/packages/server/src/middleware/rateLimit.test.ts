import { describe, expect, it, vi } from 'vitest';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DEFAULT_HTTP_RATE_LIMIT_PER_MINUTE, resolveHttpRateLimit } from './rateLimit.js';

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
