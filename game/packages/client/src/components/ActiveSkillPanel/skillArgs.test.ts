// 手里有两张同名牌时，几类「先选手牌」的技能都能同时选中两张并发出对应的 move 参数
import { describe, it, expect } from 'vitest';
import { toggleHandPick } from '../../lib/handPick';
import {
  multiCardArgs,
  multiCardDiscardArgs,
  multiCardPlayerArgs,
  twoCardsShootArgs,
} from './skillArgs';

const SHOOT = 'action_shoot';
const KICK = 'action_kick';
/** 手牌：两张 SHOOT 夹一张 KICK */
const HAND = [SHOOT, KICK, SHOOT];

/** 依次点第 0 张、第 2 张（两张同名的 SHOOT） */
const pickBothShoot = (max?: number) => toggleHandPick(toggleHandPick([], 0, max), 2, max);

describe('技能面板 · 同名牌各按位置选中', () => {
  it('露娜·月蚀（multiCardAndPlayer）：两张 SHOOT 同时选中，发 [两张 SHOOT, 目标]', () => {
    const picked = pickBothShoot();
    expect(picked).toEqual([0, 2]);
    expect(multiCardPlayerArgs(HAND, picked, 'p2')).toEqual([[SHOOT, SHOOT], 'p2']);
  });

  it('达尔文·进化（multiCard）：两张同名牌都能选中', () => {
    expect(multiCardArgs(HAND, pickBothShoot())).toEqual([[SHOOT, SHOOT]]);
  });

  it('战争之王·黑市（multiCardAndDiscardCard）：两张同名牌 + 弃牌堆里的一张', () => {
    expect(multiCardDiscardArgs(HAND, pickBothShoot(), 'action_unlock')).toEqual([
      [SHOOT, SHOOT],
      'action_unlock',
    ]);
  });

  it('火星·战场（twoCardsAndShoot，最多 2 张）：两张同名牌选中后发三个独立参数', () => {
    const picked = pickBothShoot(2);
    expect(picked).toEqual([0, 2]);
    expect(twoCardsShootArgs(HAND, picked, 'action_shoot')).toEqual([SHOOT, SHOOT, 'action_shoot']);
  });

  it('火星·战场：不是刚好 2 张时发不出', () => {
    expect(twoCardsShootArgs(HAND, [0], 'action_shoot')).toBeNull();
    expect(twoCardsShootArgs(HAND, [0, 1, 2], 'action_shoot')).toBeNull();
  });

  it('取消其中一张后另一张仍保持选中', () => {
    const picked = toggleHandPick(pickBothShoot(), 0);
    expect(picked).toEqual([2]);
    expect(multiCardArgs(HAND, picked)).toEqual([[SHOOT]]);
  });
});
