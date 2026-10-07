// 手牌的多选：按手牌位置记录，同名牌各算一张。
// 按牌 id 记录会让手里有两张同名牌时点第二张变成取消，选不出两张（露娜·月蚀必须两张 SHOOT、嫁接放回、雅典娜·惊叹要 5 张同名）。
// 发 move 时再把位置换成牌 id 列表。

/** 切换一张牌的选中：已选则取消，未选则加入；max 给出时，已满则原样返回 prev（不顶掉已选的） */
export function toggleHandPick(
  prev: readonly number[],
  index: number,
  max?: number,
): readonly number[] {
  const at = prev.indexOf(index);
  if (at >= 0) return prev.filter((_, i) => i !== at);
  if (max !== undefined && prev.length >= max) return prev;
  return [...prev, index];
}

/** 把选中的位置换成手牌里的牌 id（保持选择顺序）；越界的位置忽略 */
export function handCardsAt(hand: readonly string[], picked: readonly number[]): string[] {
  return picked.flatMap((i) =>
    Number.isInteger(i) && i >= 0 && i < hand.length ? [hand[i]!] : [],
  );
}

/** 只保留仍落在手牌范围内的位置（手牌变化后残留的选择自动失效），去重 */
export function validHandPicks(picked: readonly number[], handSize: number): number[] {
  return [...new Set(picked)].filter((i) => Number.isInteger(i) && i >= 0 && i < handSize);
}
