import { describe, expect, it } from 'vitest';
import { readFixedSeed } from './fixedSeed';

describe('readFixedSeed', () => {
  it('取出 seed 参数', () => {
    expect(readFixedSeed('?seed=e2e-local-1')).toBe('e2e-local-1');
  });

  it('接受 URLSearchParams', () => {
    expect(readFixedSeed(new URLSearchParams({ seed: 'a.b_c-9' }))).toBe('a.b_c-9');
  });

  it('没有 seed 参数时返回 undefined', () => {
    expect(readFixedSeed('')).toBeUndefined();
    expect(readFixedSeed('?players=5')).toBeUndefined();
  });

  it('空串、含非法字符、超长的种子一律忽略', () => {
    expect(readFixedSeed('?seed=')).toBeUndefined();
    expect(readFixedSeed('?seed=a%20b')).toBeUndefined();
    expect(readFixedSeed('?seed=%3Cscript%3E')).toBeUndefined();
    expect(readFixedSeed(`?seed=${'x'.repeat(65)}`)).toBeUndefined();
  });

  it('64 位恰好合法', () => {
    expect(readFixedSeed(`?seed=${'x'.repeat(64)}`)).toBe('x'.repeat(64));
  });
});
