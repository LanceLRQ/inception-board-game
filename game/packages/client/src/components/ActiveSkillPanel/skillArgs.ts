// 技能面板里「先选手牌」的几类技能：选择按手牌位置记录（同名牌各算一张），发 move 时再换成牌 id 列表。
// 对应的 move 参数：
//   multiCard（达尔文·进化）                  [牌 id 列表]
//   multiCardAndPlayer（露娜·月蚀、雅典娜·惊叹）  [牌 id 列表, 目标座位]
//   multiCardAndDiscardCard（战争之王·黑市）   [牌 id 列表, 弃牌堆里选的牌]
//   twoCardsAndShoot（火星·战场）             [牌 1, 牌 2, 弃牌堆里选的 SHOOT]（三个独立参数）

import { handCardsAt } from '../../lib/handPick';

export function multiCardArgs(hand: readonly string[], picked: readonly number[]): unknown[] {
  return [handCardsAt(hand, picked)];
}

export function multiCardPlayerArgs(
  hand: readonly string[],
  picked: readonly number[],
  targetId: string,
): unknown[] {
  return [handCardsAt(hand, picked), targetId];
}

export function multiCardDiscardArgs(
  hand: readonly string[],
  picked: readonly number[],
  discardCardId: string,
): unknown[] {
  return [handCardsAt(hand, picked), discardCardId];
}

/** 火星·战场：必须刚好选了 2 张手牌；不是 2 张返回 null */
export function twoCardsShootArgs(
  hand: readonly string[],
  picked: readonly number[],
  shootCardId: string,
): unknown[] | null {
  if (picked.length !== 2) return null;
  const [c1, c2] = handCardsAt(hand, picked);
  if (c1 === undefined || c2 === undefined) return null;
  return [c1, c2, shootCardId];
}
