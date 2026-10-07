import { describe, it, expect } from 'vitest';
import { handCardsAt, toggleHandPick, validHandPicks } from './handPick';

describe('toggleHandPick', () => {
  it('按位置选：手里有两张同名牌时两张都能选中', () => {
    const first = toggleHandPick([], 0);
    const second = toggleHandPick(first, 1);
    expect(second).toEqual([0, 1]);
  });

  it('再点已选的位置取消，不影响同名的另一张', () => {
    expect(toggleHandPick([0, 1], 0)).toEqual([1]);
  });

  it('给了上限时，满了再点新的不生效（原样返回）', () => {
    const full = [0, 1];
    expect(toggleHandPick(full, 2, 2)).toBe(full);
    expect(toggleHandPick(full, 1, 2)).toEqual([0]);
  });

  it('不给上限就不限张数', () => {
    expect(toggleHandPick([0, 1, 2, 3], 4)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('handCardsAt', () => {
  const hand = ['action_shoot', 'action_kick', 'action_shoot'];

  it('同名牌各按位置取出，保持选择顺序', () => {
    expect(handCardsAt(hand, [2, 0])).toEqual(['action_shoot', 'action_shoot']);
    expect(handCardsAt(hand, [1, 0])).toEqual(['action_kick', 'action_shoot']);
  });

  it('越界或非整数的位置忽略', () => {
    expect(handCardsAt(hand, [5, -1, 0.5, 1])).toEqual(['action_kick']);
  });
});

describe('validHandPicks', () => {
  it('手牌变少后越界的位置失效，重复的去重', () => {
    expect(validHandPicks([0, 3, 3, 1], 2)).toEqual([0, 1]);
  });
});
