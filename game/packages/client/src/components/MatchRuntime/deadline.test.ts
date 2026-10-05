// 截止时间的剩余秒数

import { describe, it, expect } from 'vitest';
import { remainingSeconds } from './deadline';

describe('remainingSeconds', () => {
  it('null 进 null 出', () => {
    expect(remainingSeconds(null, 1000)).toBeNull();
  });

  it('向上取整', () => {
    expect(remainingSeconds(10_000, 9_001)).toBe(1);
    expect(remainingSeconds(10_000, 7_500)).toBe(3);
    expect(remainingSeconds(10_000, 8_000)).toBe(2);
  });

  it('已过期最小为 0', () => {
    expect(remainingSeconds(10_000, 10_000)).toBe(0);
    expect(remainingSeconds(10_000, 20_000)).toBe(0);
  });
});
