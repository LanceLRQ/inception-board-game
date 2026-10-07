// 金库被打开与解封成功后的结算，以及贿赂牌的挑选。

import {
  applyExtractorBounty,
  applyHarborTsunami,
  applyInterpreterForeshadow,
  canImperialPickFromPool,
  harborTsunamiTargets,
  inPoolBribeIndexes,
  isOutwardThief,
  settleSpaceQueenObserve,
} from '../engine/skills.js';
import { matchEndIf } from '../endCondition.js';
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

/** 本次刚打开的金库数（任何内容） */
function countJustOpened(before: SetupState['vaults'], after: SetupState['vaults']): number {
  return after.filter((a, i) => a.isOpened && before[i] && !before[i]!.isOpened).length;
}

/**
 * 港口·海啸：每打开一个金库，若游戏没有结束，所有存活的盗梦者（含背叛者）按座位顺序各掷一颗骰子，
 * 1-5 死亡。「游戏没有结束」与终局判定共用 matchEndIf（秘密金库打开、港口两库无秘密、牌库抽完等）。
 * 对照：docs/manual/06-dream-master.md 港口 144 / 149 行
 */
function settleHarborTsunami(
  state: SetupState,
  openedCount: number,
  random: BGIORandom,
): SetupState {
  let s = state;
  for (let n = 0; n < openedCount; n++) {
    if (matchEndIf({ G: s }) !== undefined) break;
    const targets = harborTsunamiTargets(s);
    if (targets.length === 0) break;
    s = applyHarborTsunami(
      s,
      targets.map(() => random.D6()),
    );
  }
  return s;
}

// --- 内部 helper：金库刚被打开的结算 ---
// 对比 before / after：
//   1. 本次有金库被打开：港口·海啸先结算（打开瞬间触发，要掷骰，所以放在梦主三选一之前）；
//   2. 本次刚打开的是金币金库、且打开者对外是盗梦者（含背叛者）时，
//      挂起 pendingVaultDecision，由梦主在 masterVaultDecision 里三选一，这里不派贿赂牌也不动梦魇。
//      打开者被海啸带走也照常挂起（派贿赂牌对迷失层的人同样可行）。
// 打开者是梦主本人或没有打开者：什么都不发生，梦魇留在原处。
// 秘密金库由 endIf 判盗梦者胜，不在这里处理。
// 所有能翻开金库的 move 都经这里：解封成功（resolveUnlockFull）以及技能把心锁减到 0
// （射手·穿心、双子·命运、殉道者·牺牲）；random 来自当前 move。
// 对照：docs/manual/03-game-flow.md:33-36、94-103
export function settleVaultOpened(
  before: SetupState,
  after: SetupState,
  random: BGIORandom,
): SetupState {
  const opened = countJustOpened(before.vaults, after.vaults);
  const settled = opened > 0 ? settleHarborTsunami(after, opened, random) : after;
  const coinVault = findJustOpenedCoinVault(before.vaults, settled.vaults);
  const openerID = coinVault?.openedBy;
  if (!coinVault || !openerID || !isOutwardThief(settled, openerID)) return settled;
  // 贿赂池已空、该层也没有梦魇牌：梦主没有可选的东西，不挂起
  const canDeal = settled.bribePool.some((b) => b.status === 'inPool');
  if (!canDeal && !settled.layers[coinVault.layer]?.nightmareId) return settled;
  return { ...settled, pendingVaultDecision: { layer: coinVault.layer, openerID } };
}

// --- 内部 helper：解封成功完整副作用链 ---
// 由 passResponse（全员 pass）与 resolveUnlock（兜底）共享。
// 顺序：applyUnlockSuccess → 金库打开结算（港口·海啸、金币金库挂起梦主三选一）→ 译梦师抽 2 → 梦境猎手·满载 → 空间女王·监察。
// 对照：docs/manual/04-action-cards.md 解封 + docs/manual/08-appendix.md M4-4
export function resolveUnlockFull(G: SetupState, random: BGIORandom): SetupState {
  if (!G.pendingUnlock) return G;
  const unlockerId = G.pendingUnlock.playerID;
  let s = applyUnlockSuccess(G);
  s = settleVaultOpened(G, s, random);
  s = applyInterpreterForeshadow(s, unlockerId);
  s = applyExtractorBounty(s, unlockerId);
  s = settleSpaceQueenObserve(s);
  return s;
}
