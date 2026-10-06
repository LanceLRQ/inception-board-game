import { describe, it, expect } from 'vitest';
import { computePercent, GATE_DELAY_MS, GATE_MAX_MS, gateShown } from './index';

describe('computePercent', () => {
  it('returns 0 when total is 0', () => {
    expect(computePercent({ loaded: 0, total: 0 })).toBe(0);
    expect(computePercent({ loaded: 5, total: 0 })).toBe(0); // divide-by-zero guard
  });

  it('computes correct rounded percentage', () => {
    expect(computePercent({ loaded: 1, total: 4 })).toBe(25);
    expect(computePercent({ loaded: 2, total: 3 })).toBe(67);
  });

  it('clamps to 100 when loaded exceeds total', () => {
    expect(computePercent({ loaded: 12, total: 10 })).toBe(100);
  });
});

describe('gateShown', () => {
  const half = { loaded: 5, total: 10 };

  it('没有进度、没有要取的素材或已经加载完：不显示', () => {
    expect(gateShown(null, GATE_DELAY_MS)).toBe(false);
    expect(gateShown({ loaded: 0, total: 0 }, GATE_DELAY_MS)).toBe(false);
    expect(gateShown({ loaded: 10, total: 10 }, GATE_DELAY_MS)).toBe(false);
  });

  it('加载很快（没过延迟）不闪出加载界面', () => {
    expect(gateShown(half, 0)).toBe(false);
    expect(gateShown(half, GATE_DELAY_MS - 1)).toBe(false);
  });

  it('超过延迟还没加载完才显示', () => {
    expect(gateShown(half, GATE_DELAY_MS)).toBe(true);
  });

  it('超过放行上限就不再挡着对局', () => {
    expect(gateShown(half, GATE_MAX_MS - 1)).toBe(true);
    expect(gateShown(half, GATE_MAX_MS)).toBe(false);
  });
});
