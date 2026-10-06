// 进入对局前要预加载的、本人视图里已经看得到的卡牌 id
//
// 只读按座位裁剪后的视图：本人的手牌、弃牌堆、已翻开（或本人 / 梦主）的角色牌。
// 他人的手牌、未翻开的身份在视图里本来就没有，所以这里不可能按它们去取图。

import type { MatchView } from '@icgame/game-engine';

export function visibleCardIds(view: MatchView | undefined, seat: string | null): string[] {
  if (!view) return [];
  const ids = new Set<string>();
  const add = (id: unknown): void => {
    if (typeof id === 'string' && id !== '') ids.add(id);
  };
  for (const [id, p] of Object.entries(view.players ?? {})) {
    add(p.characterId);
    if (id === seat && Array.isArray(p.hand)) p.hand.forEach(add);
  }
  (view.deck?.discardPile ?? []).forEach(add);
  add(view.lastPlayedCardThisTurn);
  return [...ids];
}
