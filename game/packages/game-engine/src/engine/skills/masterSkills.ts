// 梦主技能（含梦主身份判断）
// 对照：docs/manual/06-dream-master.md

import type { SetupState, PlayerSetup } from '../../setup.js';
import {
  drawCards,
  movePlayerToLayer,
  initialHeartLock,
  discardCard,
  recordCardPlayed,
  setLayerHeartLock,
  FORTRESS_COLDNESS_CHANCES_KEY,
  HEART_LOCK_REDUCED_BY_SKILL_KEY,
} from '../../stateOps.js';
import { sendToLimbo } from '../death.js';
import { isSameNameCard, type CardID, type Layer } from '@icgame/shared';
import { canUseSkill, markSkillUsed } from './usage.js';
import { isCapricornusRhythmActive } from './thiefShoot.js';
import { isAquariusUnlimitedActive } from './thiefCards.js';

// === 梦主身份 ===
// 对照：docs/manual/06-dream-master.md

/**
 * 找当前梦主玩家 ID。以 dreamMasterID 为准：盗梦者收到成功贿赂牌后 faction 也会变成 master，
 * 按阵营扫描会把座次靠前的背叛者认成梦主。
 */
export function findMasterID(state: SetupState): string | null {
  const id = state.dreamMasterID;
  return id && state.players[id] ? id : null;
}

/**
 * 是不是梦主本人。背叛者的 faction 虽已转为 master，但他不是梦主；
 * 梦主是谁是公开信息，守卫与效果凡是「梦主专属」都以此为准。
 */
export function isDreamMaster(state: SetupState, playerID: string): boolean {
  return !!state.players[playerID] && state.dreamMasterID === playerID;
}

/**
 * 对外是不是盗梦者：存在且不是梦主本人。背叛者的身份对其他人保密、对外仍是盗梦者，
 * 所以凡是「对盗梦者合法 / 对盗梦者生效 / 只有盗梦者能做」的判断都以此为准，不读真实阵营。
 * 对照：docs/manual/03-game-flow.md 贿赂&背叛者（43 行）
 */
export function isOutwardThief(state: SetupState, playerID: string): boolean {
  return !!state.players[playerID] && state.dreamMasterID !== playerID;
}

/** 找当前梦主角色 ID */
export function getMasterCharacterID(state: SetupState): CardID | null {
  const mid = findMasterID(state);
  if (!mid) return null;
  return state.players[mid]?.characterId ?? null;
}

// === 要塞 · 冷酷 ===
// 对照：docs/manual/06-dream-master.md 要塞
// 梦主出牌阶段移动到另一层时，可视为对任一盗梦者使用 1 张 SHOOT（move 见 moves/masterSkills.ts）
// 世界观：梦主掷骰结果 -1

export const FORTRESS_SKILL_ID = 'dm_fortress.skill_0';

/** 要塞世界观：掷骰结果 -1（点数最低为 1） */
export function applyFortressDiceModifier(roll: number): number {
  return Math.max(1, roll - 1);
}

/**
 * 要塞世界观的接入点：掷骰的人是梦主本人、且当前梦主是要塞时，结果 -1，否则原样返回。
 * 背叛者不是梦主，不吃这条。灵雕师·雕琢覆盖的点数不经过这里（「不能被其它效果所改变」）。
 * 对照：docs/manual/06-dream-master.md 要塞 123 行；docs/manual/05-dream-thieves.md 灵雕师 300 行
 */
export function applyFortressWorldRoll(state: SetupState, rollerID: string, roll: number): number {
  if (rollerID !== state.dreamMasterID) return roll;
  if (state.players[rollerID]?.characterId !== 'dm_fortress') return roll;
  return applyFortressDiceModifier(roll);
}

/**
 * M4 卡宾枪：梦主对盗梦者使用 SHOOT 类牌时，目标玩家掷骰结果 -1。
 * 对照：docs/manual/03-game-flow.md §80-81 "M4卡宾枪是1个特殊效果道具..."
 * 对照：docs/manual/05-dream-thieves.md §111 "梦主SHOOT盗梦者不会触发处女·完美"（印证 M4 必须先于 processing）
 * 本批次只用于 shouldJupiterThunderKill 对齐 manual §50 示例；其余 master SHOOT 行为待后续统一接入。
 */
export function applyM4CarbineModifier(shooterIsMaster: boolean, roll: number): number {
  if (!shooterIsMaster) return roll;
  return Math.max(1, roll - 1);
}

/**
 * 要塞·冷酷还剩几次发动机会：梦主本回合出牌阶段的换层次数减去已发动次数。
 * 参数是梦主的 skillUsedThisTurn（本人视图里也有这张表，客户端按同一公式推导）。
 * 换层时记机会见 stateOps.ts 的 FORTRESS_COLDNESS_CHANCES_KEY；发动见 moves/masterSkills.ts 的 useFortressColdness。
 */
export function fortressColdnessChancesLeft(
  skillUsedThisTurn: Readonly<Record<string, number>>,
): number {
  const chances = skillUsedThisTurn[FORTRESS_COLDNESS_CHANCES_KEY] ?? 0;
  const used = skillUsedThisTurn[FORTRESS_SKILL_ID] ?? 0;
  return Math.max(0, chances - used);
}

// === 棋局 · 易位 ===
// 对照：docs/manual/06-dream-master.md 棋局
// 金库被打开前，交换两个金库。限 2 次
// 世界观：使用梦境窥视时，从牌库顶抽 2 张

export const CHESS_SKILL_ID = 'dm_chess.skill_0';
const CHESS_MAX_USES = 2;
const CHESS_WORLD_PEEK_DRAW = 2;

/** 棋局技能：交换两个金库位置 */
export function applyChessTranspose(
  state: SetupState,
  masterID: string,
  vaultIndex1: number,
  vaultIndex2: number,
): SetupState {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_chess') return state;
  if (!canUseSkill(master, CHESS_SKILL_ID, 'perGameLimitN', CHESS_MAX_USES)) return state;

  const vaults = state.vaults;
  if (vaultIndex1 < 0 || vaultIndex1 >= vaults.length) return state;
  if (vaultIndex2 < 0 || vaultIndex2 >= vaults.length) return state;
  if (vaultIndex1 === vaultIndex2) return state;

  const v1 = vaults[vaultIndex1]!;
  const v2 = vaults[vaultIndex2]!;
  // 不能交换已打开的金库
  if (v1.isOpened || v2.isOpened) return state;

  // 交换金库所在层
  const newVaults = vaults.map((v, i) => {
    if (i === vaultIndex1) return { ...v, layer: v2.layer };
    if (i === vaultIndex2) return { ...v, layer: v1.layer };
    return v;
  });

  let s: SetupState = {
    ...state,
    vaults: newVaults,
  };
  s = markSkillUsed(s, masterID, CHESS_SKILL_ID);
  return s;
}

/**
 * 棋局世界观：使用【梦境窥视】时，使用者从牌库顶抽 2 张牌。
 * 世界观对所有玩家生效：谁使用梦境窥视（效果①盗梦者、效果②梦主）谁抽，playerID 是使用者，
 * 只有当前梦主是棋局时才有效果。
 * 对照：docs/manual/06-dream-master.md 棋局 108-115 行「每当使用【梦境窥视】，都必须从牌库顶抽2张牌」
 */
export function applyChessWorldViewPeek(state: SetupState, playerID: string): SetupState {
  if (getMasterCharacterID(state) !== 'dm_chess') return state;
  // 世界观效果不走技能使用计数，是被动效果
  return drawCards(state, playerID, CHESS_WORLD_PEEK_DRAW);
}

// === 港口 · 海啸 + 世界观 ===
// 技能 海啸：当任一金库被打开，游戏未结束时，所有盗梦者各掷 1 颗骰子
//   1-5 → 该盗梦者死亡（直接迷失层，跳过击杀状态，不给手牌）
//   6   → 躲过
// 世界观 港口：当 2 个金库被打开仍未找到秘密，则梦主胜
// 对照：docs/manual/06-dream-master.md 港口

export const HARBOR_TSUNAMI_SKILL_ID = 'dm_harbor.skill_0';

/**
 * 海啸要掷骰的人：按座位顺序的存活盗梦者。
 * 「盗梦者」按对外身份算：已被贿赂转阵营但身份未公开的人也要掷，否则不掷骰本身就泄露阵营。
 * 当前梦主不是港口时为空。
 * 对照：docs/manual/06-dream-master.md 港口 149 行「所有盗梦者必须按游戏顺序各掷一次骰子」
 */
export function harborTsunamiTargets(state: SetupState): string[] {
  const mid = findMasterID(state);
  if (!mid || state.players[mid]?.characterId !== 'dm_harbor') return [];
  return state.playerOrder.filter((pid) => {
    const p = state.players[pid];
    return p && isOutwardThief(state, pid) && p.isAlive;
  });
}

/**
 * 港口·海啸：rolls 按 harborTsunamiTargets 的顺序一一对应，结果 1-5 死亡，6 躲过。
 * 死亡走 sendToLimbo：不是被梦主击杀，没有凶手与被害者，不交手牌（也不叠加 M4）。
 * 触发时机由 moves/settlement.ts 的金库打开结算负责（游戏没有结束时才结算）。
 */
export function applyHarborTsunami(state: SetupState, rolls: number[]): SetupState {
  const targets = harborTsunamiTargets(state);
  let s = state;
  targets.forEach((pid, i) => {
    const roll = rolls[i] ?? 6;
    if (roll >= 1 && roll <= 5) s = sendToLimbo(s, pid);
  });
  return s;
}

/** 港口世界观激活判定 */
export function isHarborWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_harbor';
}

/** 港口胜利判定：≥2 金库打开且秘密未开 → 梦主胜 */
export function checkHarborWin(state: SetupState): boolean {
  if (!isHarborWorldActive(state)) return false;
  const opened = state.vaults.filter((v) => v.isOpened).length;
  if (opened < 2) return false;
  const secret = state.vaults.find((v) => v.contentType === 'secret');
  return !secret?.isOpened;
}

// === 盛夏 · 充盈 + 世界观 ===
// 技能 充盈：梦主抽牌阶段，每拥有 1 张未派发贿赂牌 → 多抽 1 张
// 世界观 盛夏：所有盗梦者抽牌阶段抽牌数 +1
// 对照：docs/manual/06-dream-master.md 盛夏

/**
 * 盛夏·充盈：梦主额外抽牌数（=未派发的贿赂牌张数，已派出的不算）
 * 对照：docs/manual/06-dream-master.md 盛夏「每拥有1张未派发的贿赂牌则多抽牌1张」
 */
export function getMidsummerExtraDraws(state: SetupState): number {
  if (getMasterCharacterID(state) !== 'dm_midsummer') return 0;
  return (state.bribePool ?? []).filter((b) => b.status === 'inPool').length;
}

/** 盛夏世界观：盗梦者抽牌额外 +N（默认 +1） */
export function getMidsummerWorldThiefBonus(state: SetupState): number {
  return getMasterCharacterID(state) === 'dm_midsummer' ? 1 : 0;
}

// === 黑洞 (梦主版) · 倒流 + 世界观 ===
// 技能 倒流：梦主每回合抽牌阶段，每未开金库的层 +2 心锁，不超过原始数
// 世界观 黑洞：盗梦者每回合可成功解封 2 次
// 对照：docs/manual/06-dream-master.md 黑洞

export const BLACK_HOLE_REVERSE_SKILL_ID = 'dm_black_hole.skill_0';
const BLACK_HOLE_HEART_LOCK_REGEN = 2;

/** 黑洞·DM·倒流：每个未开金库层 +2 心锁（capped at originalHeartLocks per layer） */
export function applyBlackHoleReverse(
  state: SetupState,
  originalHeartLocks: Record<number, number>,
): SetupState {
  if (getMasterCharacterID(state) !== 'dm_black_hole') return state;

  let s = state;
  for (const layerStr of Object.keys(s.layers)) {
    const layerNum = Number(layerStr);
    if (layerNum < 1 || layerNum > 4) continue;
    const layerInfo = s.layers[layerNum];
    if (!layerInfo) continue;
    // 该层金库已开 → 不增
    const vault = s.vaults.find((v) => v.layer === layerNum);
    if (!vault || vault.isOpened) continue;
    const cap = originalHeartLocks[layerNum] ?? layerInfo.heartLockValue;
    const next = Math.min(cap, layerInfo.heartLockValue + BLACK_HOLE_HEART_LOCK_REGEN);
    if (next === layerInfo.heartLockValue) continue;
    s = setLayerHeartLock(s, layerNum, next);
  }
  return s;
}

/**
 * 各层的原有心锁数（游戏开始时的配置数量，层号 1-4），倒流恢复心锁时以它为上限。
 * 对照：docs/manual/06-dream-master.md 黑洞 137 行「心锁数的原有数量，指的是游戏开始时心锁的配置数量」
 */
export function getOriginalHeartLocks(state: SetupState): Record<number, number> {
  const caps: Record<number, number> = {};
  for (const layer of [1, 2, 3, 4]) caps[layer] = initialHeartLock(state, layer)!;
  return caps;
}

/**
 * 黑洞·倒流的结算点：梦主自己回合的抽牌阶段（抽牌与略过抽牌都算，抽牌阶段照常经过）调用一次。
 * 非梦主回合、梦主不是黑洞时原样返回；与梦主是否存活无关。
 * 对照：docs/manual/06-dream-master.md 黑洞 133 行「无论梦主此前死亡与否，都可以增加 2 个心锁」
 */
export function settleBlackHoleReverse(state: SetupState): SetupState {
  if (state.currentPlayerID !== state.dreamMasterID) return state;
  return applyBlackHoleReverse(state, getOriginalHeartLocks(state));
}

/** 黑洞世界观：解封次数上限改为 2 */
export function isBlackHoleWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_black_hole';
}

/**
 * 本回合还能不能再做一次「成功解锁」：解封成功与技能减少心锁共用同一份次数（R-23）。
 * 摩羯·节奏、水瓶·同流豁免次数上限。
 * 对照：docs/manual/03-game-flow.md:26-28
 */
export function canMakeSuccessfulUnlock(state: SetupState, player: PlayerSetup): boolean {
  if (isCapricornusRhythmActive(player) || isAquariusUnlimitedActive(player)) return true;
  const used =
    player.successfulUnlocksThisTurn +
    (player.skillUsedThisTurn[HEART_LOCK_REDUCED_BY_SKILL_KEY] ?? 0);
  return used < getEffectiveMaxUnlockPerTurn(state, state.maxUnlockPerTurn);
}

/** 获取当前实际解封次数上限（黑洞世界观时为 2，否则用 G.maxUnlockPerTurn） */
export function getEffectiveMaxUnlockPerTurn(state: SetupState, base: number): number {
  return isBlackHoleWorldActive(state) ? Math.max(base, 2) : base;
}

// === 海王星·泓洋 · 风暴 + 世界观 ===
// 技能 风暴：每当心锁数减少时 / 时间风暴效果结算后 → 牌库顶弃 5 张
// 世界观 泓洋：当放着金币的金库被打开 → 梦主胜
// 对照：docs/manual/06-dream-master.md 海王星·泓洋

export const NEPTUNE_STORM_SKILL_ID = 'dm_neptune_ocean.skill_0';

// 风暴的实现与触发点（心锁减少、时间风暴结算）都在 stateOps.ts：
// 技能模块依赖 stateOps，反过来引用会形成环，所以实现放在底层，这里再导出供外部沿用原路径取用
export { applyNeptuneStorm } from '../../stateOps.js';

/** 海王星泓洋胜利判定：金币金库被打开 → 梦主胜 */
export function checkNeptuneWin(state: SetupState): boolean {
  if (getMasterCharacterID(state) !== 'dm_neptune_ocean') return false;
  return state.vaults.some((v) => v.isOpened && v.contentType === 'coin');
}

// === 木星·巅峰 · 雷霆 + 世界观 ===
// 技能 雷霆：梦主使用 SHOOT 类牌，目标掷骰 < 梦主所在层数 → 直接击杀
// 世界观 巅峰：SHOOT 类牌可对相邻层数玩家使用
// 对照：docs/manual/06-dream-master.md 木星·巅峰

/** 木星巅峰世界观激活 */
export function isJupiterPeakWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_jupiter_peak';
}

/** 巅峰世界观：SHOOT 跨层判定（同层或相邻层即可） */
export function isJupiterPeakLayerOK(shooterLayer: number, targetLayer: number): boolean {
  if (shooterLayer === targetLayer) return true;
  // 相邻层（不包括迷失层 0）
  if (shooterLayer < 1 || targetLayer < 1) return false;
  return Math.abs(shooterLayer - targetLayer) === 1;
}

/** 木星·雷霆：是否触发额外击杀（只在梦主为 dm_jupiter_peak 且骰值<梦主层时返回 true） */
export function shouldJupiterThunderKill(
  shooterCharacter: CardID,
  shooterLayer: number,
  finalRoll: number,
): boolean {
  if (shooterCharacter !== 'dm_jupiter_peak') return false;
  if (shooterLayer < 1) return false;
  return finalRoll < shooterLayer;
}

// === 土星·领地 · 律令 ===
// 技能 律令：弃 1 手牌抵消 1 张同名牌效果，并从牌库顶抽 1。接入对局的应答流程见 engine/saturnDecree.ts
// 世界观 领地：拥有贿赂的盗梦者，自己回合出牌阶段可不用行动牌移动 1 次到相邻层
// 对照：docs/manual/06-dream-master.md:168-173 土星·领地

export const SATURN_DECREE_SKILL_ID = 'dm_saturn_territory.skill_0';

/**
 * 律令：梦主弃 1 张手牌抵消 1 张同名牌（纯函数）。
 * 顺序按「先抵消同名牌效果，然后再抽牌」：梦主弃牌（弃出的是时间风暴则按从手牌弃掉的规则触发）→
 * 被抵消的牌作废进弃牌堆（效果不结算，但算本回合打出过）→ 梦主从牌库顶抽 1 张（牌库空了就抽不到）。
 * 不满足条件（梦主不是存活的土星、手牌里没有这张牌、弃的牌与被抵消的牌不同名、被抵消的牌不在出牌者手里）返回 null。
 * 对照：docs/manual/06-dream-master.md:168-173 土星·领地；docs/manual/04-action-cards.md:165 同名牌
 */
export function applySaturnDecree(
  state: SetupState,
  masterID: string,
  discardCardId: CardID,
  countered: { userID: string; cardId: CardID },
): SetupState | null {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_saturn_territory') return null;
  if (!master.isAlive) return null;
  if (!master.hand.includes(discardCardId)) return null;
  if (!isSameNameCard(discardCardId, countered.cardId)) return null;
  const user = state.players[countered.userID];
  const at = user?.hand.indexOf(countered.cardId) ?? -1;
  if (!user || at === -1) return null;

  let s = discardCard(state, masterID, discardCardId);
  // 被抵消的牌离开出牌者的手牌，进弃牌堆；不走「从手牌弃掉」（它是被打出后作废，不是被弃掉）
  const hand = [...user.hand];
  hand.splice(at, 1);
  s = {
    ...s,
    players: { ...s.players, [countered.userID]: { ...user, hand } },
    deck: { ...s.deck, discardPile: [...s.deck.discardPile, countered.cardId] },
  };
  s = recordCardPlayed(s, countered.cardId);
  return drawCards(s, masterID, 1);
}

/** 土星领地世界观：盗梦者持有贿赂时获得 1 次免费移动（消耗后置 false） */
export function canSaturnFreeMove(state: SetupState, playerID: string): boolean {
  if (getMasterCharacterID(state) !== 'dm_saturn_territory') return false;
  const p = state.players[playerID];
  if (!p || !isOutwardThief(state, playerID) || !p.isAlive) return false;
  return p.bribeReceived > 0;
}

// === 皇城 · 重金 ===
// 派发贿赂时，可以选取 1 张给予该盗梦者（替代随机抽取）
// 对照：docs/manual/06-dream-master.md 皇城

export const IMPERIAL_BRIBE_SKILL_ID = 'dm_imperial_city.skill_0';

/** 皇城·重金：梦主是皇城、且指定的是池里还没派出的牌（不看收牌的人） */
export function canImperialPickFromPool(
  state: SetupState,
  masterID: string,
  poolIndex: number,
): boolean {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_imperial_city') return false;
  if (!master.isAlive) return false;
  const bribe = state.bribePool[poolIndex];
  return bribe !== undefined && bribe.status === 'inPool';
}

/** 皇城·重金：是否可以使用（梦主为皇城且目标合法） */
export function canImperialPickBribe(
  state: SetupState,
  masterID: string,
  targetID: string,
  poolIndex: number,
): boolean {
  const target = state.players[targetID];
  if (!target || !target.isAlive || !isOutwardThief(state, targetID)) return false;
  return canImperialPickFromPool(state, masterID, poolIndex);
}

// === 密道 · 传送 ===
// 你的梦境穿梭剂可以将任一盗梦者移动至迷失层。回合限 2 次。
// 被送至迷失层的盗梦者不需要给予手牌（跳过击杀状态）
// 对照：docs/manual/06-dream-master.md 密道

export const SECRET_PASSAGE_SKILL_ID = 'dm_secret_passage.skill_0';
const SECRET_PASSAGE_MAX_USES_PER_TURN = 2;

/** 密道·传送：把任一盗梦者送到迷失层 */
export function applySecretPassageTeleport(
  state: SetupState,
  masterID: string,
  targetID: string,
  transitCardId: CardID,
): SetupState | null {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_secret_passage') return null;
  if (!master.isAlive) return null;
  const target = state.players[targetID];
  if (!target || !target.isAlive || !isOutwardThief(state, targetID)) return null;
  if (transitCardId !== 'action_dream_transit') return null;
  if (!master.hand.includes(transitCardId)) return null;
  if (
    !canUseSkill(master, SECRET_PASSAGE_SKILL_ID, 'ownTurnLimitN', SECRET_PASSAGE_MAX_USES_PER_TURN)
  )
    return null;

  // 弃掉穿梭剂
  let s = discardCard(state, masterID, transitCardId);
  s = markSkillUsed(s, masterID, SECRET_PASSAGE_SKILL_ID);
  // 直接送到迷失层（跳过击杀状态，保留手牌）
  s = sendToLimbo(s, targetID);
  return s;
}

// === 天王星·苍穹 · 权力 ===
// 出牌阶段，每拥有 1 张未派发贿赂 → 可令一位盗梦者移动到除迷失层外指定层数
// 必须移动到不同层；可重复对同一人
// 对照：docs/manual/06-dream-master.md 天王星·苍穹

export const URANUS_POWER_SKILL_ID = 'dm_uranus_firmament.skill_0';

/** 天王星·权力：移动指定盗梦者到指定层（非迷失层） */
export function applyUranusPower(
  state: SetupState,
  masterID: string,
  targetID: string,
  targetLayer: Layer,
): SetupState | null {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_uranus_firmament') return null;
  if (!master.isAlive) return null;
  const target = state.players[targetID];
  if (!target || !target.isAlive || !isOutwardThief(state, targetID)) return null;
  // 必须移动到不同层
  if (target.currentLayer === targetLayer) return null;
  // 不能送迷失层
  if (targetLayer < 1 || targetLayer > 4) return null;

  // 上限 = 未派发贿赂数
  const inPoolCount = state.bribePool.filter((b) => b.status === 'inPool').length;
  if (inPoolCount === 0) return null;
  const usedThisTurn = master.skillUsedThisTurn[URANUS_POWER_SKILL_ID] ?? 0;
  if (usedThisTurn >= inPoolCount) return null;

  let s = markSkillUsed(state, masterID, URANUS_POWER_SKILL_ID);
  s = movePlayerToLayer(s, targetID, targetLayer);
  return s;
}

// === 冥王星·地狱 · 业火 ===
// 弃 1 张手牌 → 让所有手牌不足 2 张的盗梦者从牌库顶各抽 2 张
// 发动次数无限制，但必须有盗梦者手牌不足 2 张才能发动
// 对照：docs/manual/06-dream-master.md 冥王星·地狱（详述：【业火】发动的次数无限制）

export const PLUTO_BURNING_SKILL_ID = 'dm_pluto_hell.skill_0';
const PLUTO_DRAW_THRESHOLD = 2;
const PLUTO_DRAW_AMOUNT = 2;

/** 冥王星·业火：弃 1 → 所有手牌<2 的盗梦者抽 2 */
export function applyPlutoBurning(
  state: SetupState,
  masterID: string,
  discardCardId: CardID,
): SetupState | null {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_pluto_hell') return null;
  if (!master.isAlive) return null;
  if (!master.hand.includes(discardCardId)) return null;

  // 前置检查：必须存在至少 1 名手牌<2 的存活盗梦者（manual §30 "不产生效果的技能不能无故启动"）
  // 对照：docs/manual/06-dream-master.md 冥王星·地狱 详述
  const preTargets = state.playerOrder.filter((pid) => {
    const p = state.players[pid];
    return p && p.isAlive && isOutwardThief(state, pid) && p.hand.length < PLUTO_DRAW_THRESHOLD;
  });
  if (preTargets.length === 0) return null;

  // 弃 1
  // 发动次数无限制（docs/manual/06-dream-master.md 冥王星·地狱 详述），受上面的前置检查约束
  let s = discardCard(state, masterID, discardCardId);

  // 所有手牌<2 的存活盗梦者抽 2（再次快照防止中途状态漂移）
  const targets = s.playerOrder.filter((pid) => {
    const p = s.players[pid];
    return p && p.isAlive && isOutwardThief(s, pid) && p.hand.length < PLUTO_DRAW_THRESHOLD;
  });
  for (const pid of targets) {
    s = drawCards(s, pid, PLUTO_DRAW_AMOUNT);
  }
  return s;
}

// === 火星·战场 · 杀戮 ===
// 出牌阶段：弃 1 张解封 → 发动 1 张梦魇牌效果（无需翻开）
// 弃解封 + 在指定层调用 applyNightmareEffect

export const MARS_KILL_SKILL_ID = 'dm_mars_battlefield.skill_0';

/** 火星·杀戮：是否可以发动（梦主为火星且手牌有解封） */
export function canMarsKill(state: SetupState, masterID: string): boolean {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_mars_battlefield') return false;
  if (!master.isAlive) return false;
  return master.hand.includes('action_unlock');
}

/** 火星·杀戮：弃掉 1 张解封（不消耗 perTurn 计数；梦魇结算由 moves/masterSkills.ts 接入） */
export function applyMarsKillDiscardUnlock(state: SetupState, masterID: string): SetupState | null {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_mars_battlefield') return null;
  if (!master.isAlive) return null;
  if (!master.hand.includes('action_unlock')) return null;

  return discardCard(state, masterID, 'action_unlock' as CardID);
}

// === 水星·航路 逆流（被动：贿赂者对梦主出牌 → 梦主先收入） ===

export const MERCURY_REVERSE_SKILL_ID = 'dm_mercury_route.skill_0';

/**
 * 水星·航路 逆流技能：同层贿赂者对梦主出牌时，梦主先收入手牌再结算。
 * 限制：回合限 2 次；不能获取时间风暴。
 * 触发时机：onCardPlayedAgainstMaster
 * 对照：docs/manual/06-dream-master.md 水星·航路 逆流
 */
export function applyMercuryReverse(
  state: SetupState,
  cardPlayerID: string,
  cardId: CardID,
  targetPlayerID: string,
): SetupState | null {
  const masterID = state.dreamMasterID;
  if (targetPlayerID !== masterID) return null;

  const master = state.players[masterID];
  if (!master || !master.isAlive) return null;
  if (master.characterId !== 'dm_mercury_route') return null;

  // 出牌者不是梦主自己
  if (cardPlayerID === masterID) return null;

  const cardPlayer = state.players[cardPlayerID];
  if (!cardPlayer || !cardPlayer.isAlive) return null;

  // 出牌者是另一位拥有贿赂牌的盗梦者：收到过贿赂牌即算（不论成败，张数公开），
  // 不读真实阵营，背叛者与持有失败贿赂牌的盗梦者一视同仁
  // 对照：docs/manual/06-dream-master.md 水星·航路 逆流
  if (!isOutwardThief(state, cardPlayerID) || cardPlayer.bribeReceived <= 0) return null;

  // 同层
  if (cardPlayer.currentLayer !== master.currentLayer) return null;

  // 不能获取时间风暴
  if (cardId === 'action_time_storm') return null;

  // 回合限 2 次
  const usedCount = master.skillUsedThisTurn[MERCURY_REVERSE_SKILL_ID] ?? 0;
  if (usedCount >= 2) return null;

  // 从弃牌堆末尾取出该牌（刚被 discardCard 放入），加入梦主手牌
  const dp = state.deck.discardPile;
  const lastIdx = dp.length - 1;
  if (lastIdx < 0 || dp[lastIdx] !== cardId) return null;

  return markSkillUsed(
    {
      ...state,
      deck: { ...state.deck, discardPile: dp.slice(0, lastIdx) },
      players: {
        ...state.players,
        [masterID]: { ...master, hand: [...master.hand, cardId] },
      },
    },
    masterID,
    MERCURY_REVERSE_SKILL_ID,
  );
}
