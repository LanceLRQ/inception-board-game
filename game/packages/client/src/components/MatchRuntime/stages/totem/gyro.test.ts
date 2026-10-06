import { describe, expect, it } from 'vitest';
import {
  GAUGE_CIRCUMFERENCE,
  GAUGE_RADIUS,
  GAUGE_TICKS,
  deckPercent,
  deckRatio,
  gaugeDashOffset,
} from './gyro';

describe('陀螺仪牌库读数', () => {
  it('周长是 2πr', () => {
    expect(GAUGE_CIRCUMFERENCE).toBeCloseTo(2 * Math.PI * GAUGE_RADIUS, 6);
  });

  it('表圈刻度是每 30 度一格，共 12 格', () => {
    expect(GAUGE_TICKS).toHaveLength(12);
    expect(GAUGE_TICKS[0]).toBe(0);
    expect(GAUGE_TICKS[11]).toBe(330);
    GAUGE_TICKS.forEach((a, i) => expect(a).toBe(i * 30));
  });

  it('剩余比例夹在 0–1，总数无效时为 0', () => {
    expect(deckRatio(23, 60)).toBeCloseTo(23 / 60, 9);
    expect(deckRatio(60, 60)).toBe(1);
    expect(deckRatio(0, 60)).toBe(0);
    expect(deckRatio(80, 60)).toBe(1);
    expect(deckRatio(-5, 60)).toBe(0);
    for (const total of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(deckRatio(10, total)).toBe(0);
    }
    expect(deckRatio(Number.NaN, 60)).toBe(0);
  });

  it('百分比取整', () => {
    expect(deckPercent(23, 60)).toBe(38);
    expect(deckPercent(60, 60)).toBe(100);
    expect(deckPercent(0, 60)).toBe(0);
    expect(deckPercent(1, 0)).toBe(0);
  });

  it('描边偏移：满牌库偏移为 0，空牌库偏移为整圈，23/60 约为 248.1', () => {
    expect(gaugeDashOffset(60, 60)).toBeCloseTo(0, 6);
    expect(gaugeDashOffset(0, 60)).toBeCloseTo(GAUGE_CIRCUMFERENCE, 6);
    expect(gaugeDashOffset(23, 60)).toBeCloseTo(GAUGE_CIRCUMFERENCE * (1 - 23 / 60), 6);
  });
});
