import { describe, it, expect } from 'vitest';
import { pipsFor } from './pips';

describe('pipsFor', () => {
  it('骰面 1-6 的点数与数值一致', () => {
    for (let n = 1; n <= 6; n++) expect(pipsFor(n)).toHaveLength(n);
  });

  it('0 及以下没有点，超过 6 按 6 画', () => {
    expect(pipsFor(0)).toEqual([]);
    expect(pipsFor(-2)).toEqual([]);
    expect(pipsFor(9)).toHaveLength(6);
  });

  it('点位都落在骰面内', () => {
    for (let n = 1; n <= 6; n++) {
      for (const [x, y] of pipsFor(n)) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(100);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(100);
      }
    }
  });
});
