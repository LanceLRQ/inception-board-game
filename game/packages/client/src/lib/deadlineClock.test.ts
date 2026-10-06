// 联机倒计时的时钟换算

import { describe, it, expect } from 'vitest';
import { monotonicNow, remainingSeconds, toLocalDeadline } from './deadlineClock';

describe('toLocalDeadline', () => {
  it('优先用服务端给的剩余毫秒，日历时间取什么值都无关', () => {
    for (const wall of [
      0,
      1_700_000_000_000,
      1_700_000_000_000 + 600_000,
      1_700_000_000_000 - 600_000,
    ]) {
      expect(toLocalDeadline(1_700_000_030_000, 30_000, 5_000, wall)).toBe(35_000);
    }
  });

  it('剩余毫秒为负时按 0 处理', () => {
    expect(toLocalDeadline(1, -500, 5_000, 0)).toBe(5_000);
  });

  it('没有剩余毫秒时退回用服务端截止时间与本机日历时间之差', () => {
    expect(toLocalDeadline(1_700_000_030_000, undefined, 5_000, 1_700_000_000_000)).toBe(35_000);
    expect(toLocalDeadline(1_700_000_030_000, null, 5_000, 1_700_000_040_000)).toBe(5_000);
  });

  it('两者都没有则没有计时', () => {
    expect(toLocalDeadline(null, undefined, 5_000, 0)).toBeNull();
    expect(toLocalDeadline(null, null, 5_000, 0)).toBeNull();
  });
});

describe('remainingSeconds', () => {
  it('null 进 null 出；向上取整；过期为 0', () => {
    expect(remainingSeconds(null, 1000)).toBeNull();
    expect(remainingSeconds(10_000, 9_001)).toBe(1);
    expect(remainingSeconds(10_000, 7_500)).toBe(3);
    expect(remainingSeconds(10_000, 20_000)).toBe(0);
  });
});

describe('monotonicNow', () => {
  it('不会倒退', () => {
    const a = monotonicNow();
    const b = monotonicNow();
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
