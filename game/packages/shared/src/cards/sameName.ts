// 同名牌判定：土星·律令「抵消 1 张同名牌」据此判断手牌能否抵消被打出的牌。
//
// 两张牌同名，当且仅当它们是同一种牌，或者其中一张是 SHOOT·梦境穿梭剂、另一张是 SHOOT 或梦境穿梭剂：
//   「【SHOOT·梦境穿梭剂】视为一张【SHOOT】的同名牌，同时也视为一张【梦境穿梭剂】的同名牌」
// 这个关系不传递：SHOOT 与梦境穿梭剂之间并不同名；特殊 SHOOT（刺客之王 / 爆甲螺旋 / 炸裂弹头）各有各的名字。
// 对照：docs/manual/04-action-cards.md:165 SHOOT·梦境穿梭剂；docs/manual/06-dream-master.md:168 土星·律令

import type { CardID } from '../types/enums.js';

const HYBRID_CARD = 'action_shoot_dream_transit';

/** 混合牌同时视为同名的两种牌 */
const HYBRID_COUNTS_AS: ReadonlySet<string> = new Set(['action_shoot', 'action_dream_transit']);

/** 两张牌是否同名 */
export function isSameNameCard(a: CardID, b: CardID): boolean {
  if (a === b) return true;
  return (
    (a === HYBRID_CARD && HYBRID_COUNTS_AS.has(b)) || (b === HYBRID_CARD && HYBRID_COUNTS_AS.has(a))
  );
}
