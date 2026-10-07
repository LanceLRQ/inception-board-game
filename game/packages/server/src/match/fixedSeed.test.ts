import { describe, expect, it } from 'vitest';
import { FIXED_MATCH_SEED_ENV, resolveFixedMatchSeed } from './fixedSeed.js';

describe('resolveFixedMatchSeed', () => {
  it('没配置或为空串：不固定种子', () => {
    expect(resolveFixedMatchSeed({})).toBeUndefined();
    expect(resolveFixedMatchSeed({ [FIXED_MATCH_SEED_ENV]: '' })).toBeUndefined();
  });

  it('生产环境没配置：照常随机', () => {
    expect(resolveFixedMatchSeed({ NODE_ENV: 'production' })).toBeUndefined();
  });

  it('非生产环境配置了：每次都给同一个种子', () => {
    const seed = resolveFixedMatchSeed({ NODE_ENV: 'test', [FIXED_MATCH_SEED_ENV]: 'e2e-1' });
    expect(seed?.()).toBe('e2e-1');
    expect(seed?.()).toBe('e2e-1');
  });

  it('生产环境配置了：抛错，进程拒绝启动', () => {
    expect(() =>
      resolveFixedMatchSeed({ NODE_ENV: 'production', [FIXED_MATCH_SEED_ENV]: 'e2e-1' }),
    ).toThrow(FIXED_MATCH_SEED_ENV);
  });

  it('格式不合法：抛错', () => {
    for (const bad of ['a b', '种子', 'x'.repeat(129), '../x']) {
      expect(() => resolveFixedMatchSeed({ [FIXED_MATCH_SEED_ENV]: bad })).toThrow();
    }
  });
});
