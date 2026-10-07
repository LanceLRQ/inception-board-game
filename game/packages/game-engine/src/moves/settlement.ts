// 金库被打开与解封成功后的结算，以及贿赂牌的挑选。

import {
  applyExtractorBounty,
  applyInterpreterForeshadow,
  canImperialPickFromPool,
  inPoolBribeIndexes,
  isOutwardThief,
  settleSpaceQueenObserve,
} from '../engine/skills.js';
import type { SetupState } from '../setup.js';
import { applyUnlockSuccess } from '../stateOps.js';
import type { BGIORandom } from './common.js';

// --- 内部 helper：选出这次要派的贿赂牌 ---
// 指定了下标（皇城·重金，派发贿赂时可指定 1 张）：梦主必须是皇城、该张必须还在池里，否则非法；
// 没指定：从池里还没派出的牌里随机抽 1 张，池里一张都没有时返回 null。
export function resolveBribePick(
  G: SetupState,
  random: BGIORandom,
  poolIndex: unknown,
): number | null | 'invalid' {
  if (poolIndex !== undefined && poolIndex !== null) {
    if (typeof poolIndex !== 'number') return 'invalid';
    return canImperialPickFromPool(G, G.dreamMasterID, poolIndex) ? poolIndex : 'invalid';
  }
  const inPool = inPoolBribeIndexes(G);
  if (inPool.length === 0) return null;
  return random.Shuffle(inPool)[0]!;
}

/** 对比 before/after 的 vaults，返回本次刚打开的金币金库（若有） */
function findJustOpenedCoinVault(
  before: SetupState['vaults'],
  after: SetupState['vaults'],
): (typeof after)[number] | null {
  for (let i = 0; i < after.length; i++) {
    const a = after[i]!;
    const b = before[i];
    if (a.isOpened && b && !b.isOpened && a.contentType === 'coin') return a;
  }
  return null;
}

// --- 内部 helper：金库刚被打开的结算 ---
// 对比 before / after：本次刚打开的是金币金库、且打开者对外是盗梦者（含背叛者）时，
// 挂起 pendingVaultDecision，由梦主在 masterVaultDecision 里三选一，这里不派贿赂牌也不动梦魇。
// 打开者是梦主本人或没有打开者：什么都不发生，梦魇留在原处。
// 秘密金库由 endIf 判盗梦者胜，不在这里处理。解封与技能把心锁减到 0 翻开金库都走这里。
// 对照：docs/manual/03-game-flow.md:33-36、94-103
export function settleVaultOpened(before: SetupState, after: SetupState): SetupState {
  const coinVault = findJustOpenedCoinVault(before.vaults, after.vaults);
  const openerID = coinVault?.openedBy;
  if (!coinVault || !openerID || !isOutwardThief(after, openerID)) return after;
  // 贿赂池已空、该层也没有梦魇牌：梦主没有可选的东西，不挂起
  const canDeal = after.bribePool.some((b) => b.status === 'inPool');
  if (!canDeal && !after.layers[coinVault.layer]?.nightmareId) return after;
  return { ...after, pendingVaultDecision: { layer: coinVault.layer, openerID } };
}

// --- 内部 helper：解封成功完整副作用链 ---
// 由 passResponse（全员 pass）与 resolveUnlock（兜底）共享。
// 顺序：applyUnlockSuccess → 金币金库挂起梦主三选一 → 译梦师抽 2 → 梦境猎手·满载 → 空间女王·监察。
// 对照：docs/manual/04-action-cards.md 解封 + docs/manual/08-appendix.md M4-4
export function resolveUnlockFull(G: SetupState): SetupState {
  if (!G.pendingUnlock) return G;
  const unlockerId = G.pendingUnlock.playerID;
  let s = applyUnlockSuccess(G);
  s = settleVaultOpened(G, s);
  s = applyInterpreterForeshadow(s, unlockerId);
  s = applyExtractorBounty(s, unlockerId);
  s = settleSpaceQueenObserve(s);
  return s;
}
