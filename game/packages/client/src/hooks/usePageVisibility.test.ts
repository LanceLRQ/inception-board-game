// usePageVisibility 纯函数测试

import { describe, it, expect } from 'vitest';
import { computeAwayDuration, isHardCutoff } from './usePageVisibility';

describe('computeAwayDuration', () => {
  it('returns 0 when leftAt is null', () => {
    expect(computeAwayDuration(null, 1000)).toBe(0);
  });

  it('returns 0 when leftAt is zero', () => {
    expect(computeAwayDuration(0, 1000)).toBe(0);
  });

  it('returns 0 when returnedAt <= leftAt (clock skew)', () => {
    expect(computeAwayDuration(1000, 1000)).toBe(0);
    expect(computeAwayDuration(1000, 500)).toBe(0);
  });

  it('computes elapsed in ms', () => {
    expect(computeAwayDuration(1_000, 1_500)).toBe(500);
    expect(computeAwayDuration(1_000, 181_000)).toBe(180_000);
  });
});

describe('isHardCutoff', () => {
  it('is false below threshold', () => {
    expect(isHardCutoff(0, 180_000)).toBe(false);
    expect(isHardCutoff(179_999, 180_000)).toBe(false);
  });

  it('is true at exact threshold', () => {
    expect(isHardCutoff(180_000, 180_000)).toBe(true);
  });

  it('is true above threshold', () => {
    expect(isHardCutoff(200_000, 180_000)).toBe(true);
  });
});
