import { describe, it, expect } from 'vitest';
import { countdownFraction } from './useUnlockResponse';

describe('countdownFraction', () => {
  it('按剩余秒数相对总时长计算', () => {
    expect(countdownFraction(15, 30_000)).toBe(0.5);
    expect(countdownFraction(30, 30_000)).toBe(1);
    expect(countdownFraction(0, 30_000)).toBe(0);
  });

  it('夹在 0..1 之间', () => {
    expect(countdownFraction(99, 30_000)).toBe(1);
    expect(countdownFraction(-3, 30_000)).toBe(0);
  });

  it('没有剩余信息或总时长未知时为 null', () => {
    expect(countdownFraction(null, 30_000)).toBeNull();
    expect(countdownFraction(10, 0)).toBeNull();
  });
});
