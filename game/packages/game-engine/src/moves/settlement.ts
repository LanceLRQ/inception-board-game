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
import { type DiceResume, openDiceGate } from './diceGate.js';

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
 * 每打开一个金库开一道掷骰闸门，被点名的人各自掷；没有可掷的人或游戏已结束时返回 null。
 * 对照：docs/manual/06-dream-master.md 港口 144 / 149 行
 */
function openTsunamiGate(
  s: SetupState,
  tail: Omit<Extract<DiceResume, { purpose: 'tsunami' }>, 'purpose'>,
): SetupState | null {
  if (tail.roundsLeft <= 0 || matchEndIf({ G: s }) !== undefined) return null;
  return openDiceGate(s, {
    by: null,
    target: null,
    rollers: harborTsunamiTargets(s),
    resume: { purpose: 'tsunami', ...tail },
  });
}

/** 海啸这一轮的骰子掷完：结算死亡，还有没打开完的金库就开下一轮，否则接着做金库打开之后的事 */
export function settleTsunamiDice(
  G: SetupState,
  resume: Extract<DiceResume, { purpose: 'tsunami' }>,
  random: BGIORandom,
): SetupState {
  const targets = harborTsunamiTargets(G);
  const s = applyHarborTsunami(
    G,
    targets.map(() => random.D6()),
  );
  const tail = { ...resume, roundsLeft: resume.roundsLeft - 1 };
  return openTsunamiGate(s, tail) ?? finishVaultOpened(s, tail.coinVaultLayer, tail.unlockerID);
}

/**
 * 金库打开（含海啸）之后：本次刚打开的是金币金库、且打开者对外是盗梦者（含背叛者）时，
 * 挂起 pendingVaultDecision，由梦主在 masterVaultDecision 里三选一，这里不派贿赂牌也不动梦魇。
 * 打开者被海啸带走也照常挂起（派贿赂牌对迷失层的人同样可行）。
 * 由解封触发时（unlockerID 不为空）再接解封成功的后续。
 */
function finishVaultOpened(
  s: SetupState,
  coinVaultLayer: number | null,
  unlockerID: string | null,
): SetupState {
  let next = s;
  const coinVault =
    coinVaultLayer === null ? undefined : next.vaults.find((v) => v.layer === coinVaultLayer);
  const openerID = coinVault?.openedBy;
  if (coinVault && openerID && isOutwardThief(next, openerID)) {
    // 贿赂池已空、该层也没有梦魇牌：梦主没有可选的东西，不挂起
    const canDeal = next.bribePool.some((b) => b.status === 'inPool');
    if (canDeal || next.layers[coinVault.layer]?.nightmareId) {
      next = { ...next, pendingVaultDecision: { layer: coinVault.layer, openerID } };
    }
  }
  return unlockerID === null ? next : finishUnlock(next, unlockerID);
}

// --- 内部 helper：金库刚被打开的结算 ---
// 对比 before / after：本次有金库被打开时港口·海啸先结算（打开瞬间触发，要掷骰，所以放在梦主三选一之前），
// 海啸开了掷骰闸门就由闸门续接后面的事（finishVaultOpened）；打开者是梦主本人或没有打开者时什么都不发生，
// 梦魇留在原处。秘密金库由 endIf 判盗梦者胜，不在这里处理。
// 所有能翻开金库的 move 都经这里：解封成功（resolveUnlockFull，带 unlockerID 以便续接解封成功的后续）
// 以及技能把心锁减到 0（射手·穿心、双子·命运、殉道者·牺牲）。
// 对照：docs/manual/03-game-flow.md:33-36、94-103
export function settleVaultOpened(
  before: SetupState,
  after: SetupState,
  unlockerID: string | null = null,
): SetupState {
  const coinVaultLayer = findJustOpenedCoinVault(before.vaults, after.vaults)?.layer ?? null;
  const tail = {
    roundsLeft: countJustOpened(before.vaults, after.vaults),
    coinVaultLayer,
    unlockerID,
  };
  return openTsunamiGate(after, tail) ?? finishVaultOpened(after, coinVaultLayer, unlockerID);
}

// --- 内部 helper：解封成功完整副作用链 ---
// 由 passResponse（全员 pass）与 resolveUnlock（兜底）共享。
// 顺序：applyUnlockSuccess → 金库打开结算（港口·海啸、金币金库挂起梦主三选一）→ 译梦师抽 2 → 梦境猎手·满载 → 空间女王·监察。
// 对照：docs/manual/04-action-cards.md 解封 + docs/manual/08-appendix.md M4-4
export function resolveUnlockFull(G: SetupState): SetupState {
  if (!G.pendingUnlock) return G;
  const unlockerId = G.pendingUnlock.playerID;
  return settleVaultOpened(G, applyUnlockSuccess(G), unlockerId);
}

/** 解封成功的后续：译梦师抽 2 → 梦境猎手·满载 → 空间女王·监察 */
function finishUnlock(G: SetupState, unlockerId: string): SetupState {
  let s = applyInterpreterForeshadow(G, unlockerId);
  s = applyExtractorBounty(s, unlockerId);
  return settleSpaceQueenObserve(s);
}
