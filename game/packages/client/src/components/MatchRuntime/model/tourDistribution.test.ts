import { describe, expect, it } from 'vitest';
import {
  EMPTY_TOUR,
  buildDistribution,
  canConfirmTour,
  pickTourRecipient,
  tapTourCard,
  tourProgress,
  tourRecipientIds,
  validTourState,
} from './tourDistribution';

const hand = ['action_kick', 'action_kick', 'action_shoot', 'action_unlock'];

describe('黑天鹅·纷飞 · 接收者', () => {
  it('存活的、不是梦主的、不是本人的座位', () => {
    const players = {
      a: { isAlive: true },
      b: { isAlive: true },
      c: { isAlive: false },
      m: { isAlive: true },
    };
    expect(tourRecipientIds(players, 'a', 'm')).toEqual(['b']);
  });
});

describe('黑天鹅·纷飞 · 分配', () => {
  it('先选接收者再点牌：分给当前接收者；再点同一张取消；点已分给别人的牌改分给当前接收者', () => {
    let st = EMPTY_TOUR;
    // 没选接收者时点牌没有效果
    expect(tapTourCard(st, 0, hand.length)).toEqual(st);
    st = pickTourRecipient(st, 'b');
    st = tapTourCard(st, 0, hand.length);
    expect(st.assigned).toEqual(['b', null, null, null]);
    st = tapTourCard(st, 0, hand.length);
    expect(st.assigned).toEqual([null, null, null, null]);
    st = tapTourCard(st, 1, hand.length);
    st = pickTourRecipient(st, 'c');
    st = tapTourCard(st, 1, hand.length);
    expect(st.assigned).toEqual([null, 'c', null, null]);
  });

  it('同名牌按位置各算一张', () => {
    let st = pickTourRecipient(EMPTY_TOUR, 'b');
    st = tapTourCard(st, 0, hand.length);
    st = pickTourRecipient(st, 'c');
    st = tapTourCard(st, 1, hand.length);
    expect(buildDistribution(hand, ['b', 'c', null, null])).toEqual({
      b: ['action_kick'],
      c: ['action_kick'],
    });
    expect(st.assigned).toEqual(['b', 'c', null, null]);
  });

  it('全部分配完才能确认；分发的总张数等于手牌数', () => {
    const recipients = ['b', 'c'];
    expect(canConfirmTour(['b', 'c', 'b', null], hand.length, recipients)).toBe(false);
    expect(canConfirmTour(['b', 'c', 'b', 'b'], hand.length, recipients)).toBe(true);
    expect(canConfirmTour(['b', 'c', 'b', 'x'], hand.length, recipients)).toBe(false);
    expect(canConfirmTour([], 0, recipients)).toBe(false);
    const dist = buildDistribution(hand, ['b', 'c', 'b', 'b']);
    expect(Object.values(dist).flat()).toHaveLength(hand.length);
    expect(dist).toEqual({
      b: ['action_kick', 'action_shoot', 'action_unlock'],
      c: ['action_kick'],
    });
  });

  it('进度', () => {
    expect(tourProgress(['b', null, 'c', null])).toEqual({ done: 2, total: 4 });
  });

  it('手牌或接收者变化后残留的分配自动失效', () => {
    const st = { active: 'x', assigned: ['b', 'x', 'c'] };
    expect(validTourState(st, 2, ['b', 'c'])).toEqual({ active: null, assigned: ['b', null] });
    expect(validTourState(st, 4, ['b', 'x', 'c'])).toEqual({
      active: 'x',
      assigned: ['b', 'x', 'c', null],
    });
  });
});
