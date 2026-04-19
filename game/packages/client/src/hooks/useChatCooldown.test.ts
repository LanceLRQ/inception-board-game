// useChatCooldown 纯函数测试

import { describe, it, expect } from 'vitest';
import { computeCooldownRemaining, isCoolingDownNow } from './useChatCooldown';

describe('computeCooldownRemaining', () => {
  it('returns 0 when lastSentAt is null', () => {
    expect(computeCooldownRemaining(null, 5_000, 3_000)).toBe(0);
  });

  it('returns full cooldown immediately after send', () => {
    expect(computeCooldownRemaining(1_000, 1_000, 3_000)).toBe(3_000);
  });

  it('returns decreasing remaining as time passes', () => {
    expect(computeCooldownRemaining(1_000, 2_000, 3_000)).toBe(2_000);
    expect(computeCooldownRemaining(1_000, 3_500, 3_000)).toBe(500);
  });

  it('returns 0 at exact cooldown boundary', () => {
    expect(computeCooldownRemaining(1_000, 4_000, 3_000)).toBe(0);
  });

  it('returns 0 after cooldown expired', () => {
    expect(computeCooldownRemaining(1_000, 5_000, 3_000)).toBe(0);
  });

  it('handles clock skew (now < lastSentAt) by returning full cooldown', () => {
    // elapsed 会是负数，cooldownMs - negative > cooldownMs → 按 cooldownMs 返回
    const r = computeCooldownRemaining(5_000, 4_000, 3_000);
    expect(r).toBeGreaterThan(0);
  });
});

describe('isCoolingDownNow', () => {
  it('is false when remaining is 0', () => {
    expect(isCoolingDownNow(0)).toBe(false);
  });

  it('is true when remaining > 0', () => {
    expect(isCoolingDownNow(1)).toBe(true);
    expect(isCoolingDownNow(2_999)).toBe(true);
  });

  it("is false for negative (shouldn't happen but be safe)", () => {
    expect(isCoolingDownNow(-100)).toBe(false);
  });
});
