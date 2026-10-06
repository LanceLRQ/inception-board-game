import { describe, expect, it, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DEFAULT_REDIS_COMMAND_TIMEOUT_MS, resolveRedisCommandTimeout } from './redis.js';

describe('resolveRedisCommandTimeout', () => {
  it('缺省时用默认 5000 毫秒', () => {
    expect(resolveRedisCommandTimeout({})).toBe(DEFAULT_REDIS_COMMAND_TIMEOUT_MS);
    expect(DEFAULT_REDIS_COMMAND_TIMEOUT_MS).toBe(5000);
  });

  it('合法的正整数按配置生效，允许首尾空白', () => {
    expect(resolveRedisCommandTimeout({ REDIS_COMMAND_TIMEOUT_MS: '1500' })).toBe(1500);
    expect(resolveRedisCommandTimeout({ REDIS_COMMAND_TIMEOUT_MS: ' 800 ' })).toBe(800);
  });

  it('留空或非法值回落默认', () => {
    for (const bad of ['', '  ', 'abc', '0', '-5', '1.5', '12x', '1e3']) {
      expect(resolveRedisCommandTimeout({ REDIS_COMMAND_TIMEOUT_MS: bad })).toBe(
        DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
      );
    }
  });
});
