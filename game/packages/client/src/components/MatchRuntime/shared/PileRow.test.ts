import { describe, it, expect } from 'vitest';
import { PLAYED_VISIBLE, playedStrip } from './PileRow';

describe('playedStrip', () => {
  it('不超过上限时全部摆出，不折叠', () => {
    expect(playedStrip([])).toEqual({ shown: [], folded: 0 });
    expect(playedStrip(['a', 'b'])).toEqual({ shown: ['a', 'b'], folded: 0 });
  });

  it('超过上限时只摆最近的几张，更早的计入折叠数', () => {
    const played = Array.from({ length: PLAYED_VISIBLE + 2 }, (_, i) => `c${i}`);
    const { shown, folded } = playedStrip(played);
    expect(shown).toEqual(played.slice(2));
    expect(folded).toBe(2);
  });
});
