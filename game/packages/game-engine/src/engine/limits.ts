// 回合里的几项数量上限与加成：手牌上限、抽牌数、解封次数上限
// 全是纯函数，不抽随机数；需要骰子的地方由调用方掷好后传入。
// 对照：docs/manual/03-game-flow.md 回合流程、docs/manual/05-dream-thieves.md 巨蟹、
//       docs/manual/06-dream-master.md 盛夏 / 冥王星 / 黑洞

import { BASE_DRAW_COUNT, HAND_LIMIT } from '../config.js';
import type { SetupState } from '../setup.js';
import {
  getCancerAuraBonus,
  getMidsummerExtraDraws,
  getMidsummerWorldThiefBonus,
  isCancerShelterActive,
  isOutwardThief,
  isPlutoHellWorldActive,
} from './skills.js';

// 黑洞世界观下的解封次数上限只有这一处定义，在 skills.ts；这里再导出，方便与其他上限放在一起取用
export { getEffectiveMaxUnlockPerTurn } from './skills.js';

/**
 * 某玩家此刻的手牌上限；没有上限时返回 null（不用 Infinity，状态与视图都要能序列化）。
 * 巨蟹·庇佑：与活着的巨蟹同层（含巨蟹自己）→ 无手牌上限。
 * 对照：docs/manual/05-dream-thieves.md 巨蟹「庇佑」
 */
export function getHandLimit(state: SetupState, playerID: string): number | null {
  return isCancerShelterActive(state, playerID) ? null : HAND_LIMIT;
}

/**
 * 小丑·失控罚则是否在本回合生效：当回合发动过【失控】，弃牌阶段必须弃掉所有手牌。
 * 对照：docs/manual/05-dream-thieves.md 小丑「则你在弃牌阶段必须弃掉所有手牌」
 */
export function isForcedFullDiscard(state: SetupState, playerID: string): boolean {
  const armedAt = state.players[playerID]?.forcedDiscardArmedAtTurn;
  return typeof armedAt === 'number' && armedAt === state.turnNumber;
}

/**
 * 弃牌阶段此刻必须弃几张：手牌超出上限的张数；无上限或没超限为 0。
 * 小丑·失控罚则生效时是全部手牌，巨蟹·庇佑不免除。
 */
export function getDiscardRequired(state: SetupState, playerID: string): number {
  const player = state.players[playerID];
  if (!player) return 0;
  if (isForcedFullDiscard(state, playerID)) return player.hand.length;
  const limit = getHandLimit(state, playerID);
  return limit === null ? 0 : Math.max(0, player.hand.length - limit);
}

/**
 * 这名玩家的抽牌数是否由骰子决定：冥王星·地狱世界观下，盗梦者抽牌数 = 1 颗骰子结果。
 * 调用方只在返回 true 时掷骰，再把结果传给 getTurnDrawCount。
 * 对照：docs/manual/06-dream-master.md 冥王星·地狱
 */
export function needsPlutoHellRoll(state: SetupState, playerID: string): boolean {
  return isPlutoHellWorldActive(state) && isOutwardThief(state, playerID);
}

/**
 * 抽牌阶段的抽牌数。
 * plutoRoll 是冥王星·地狱掷出的骰子结果（见 needsPlutoHellRoll），不需要掷骰时传 null。
 *   - 基础：2 张；冥王星·地狱下盗梦者改为骰子结果
 *   - 盛夏·充盈：梦主多抽 = 未派发贿赂牌数（背叛者虽属梦主阵营，没有梦主的技能）
 *   - 盛夏·世界观：盗梦者多抽 1 张
 *   - 巨蟹·气场：与活着的巨蟹同层（含自己）多抽 1 张，迷失层不触发
 * 对照：docs/manual/06-dream-master.md 盛夏 / 冥王星、docs/manual/05-dream-thieves.md 巨蟹
 */
export function getTurnDrawCount(
  state: SetupState,
  playerID: string,
  plutoRoll: number | null,
): number {
  const isThief = isOutwardThief(state, playerID);
  const isMaster = playerID === state.dreamMasterID;
  const base =
    needsPlutoHellRoll(state, playerID) && plutoRoll !== null ? plutoRoll : BASE_DRAW_COUNT;
  const midsummerMasterBonus = isMaster ? getMidsummerExtraDraws(state) : 0;
  const midsummerThiefBonus = isThief ? getMidsummerWorldThiefBonus(state) : 0;
  return base + midsummerMasterBonus + midsummerThiefBonus + getCancerAuraBonus(state, playerID);
}
