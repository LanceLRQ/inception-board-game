// 盗梦者技能 · 移动、心锁与翻面
// 对照：docs/manual/05-dream-thieves.md

import type { SetupState } from '../../setup.js';
import {
  drawCards,
  movePlayerToLayer,
  incrementMoveCounter,
  discardCards,
  setLayerHeartLock,
} from '../../stateOps.js';
import { sendToLimbo } from '../death.js';
import { flipCharacter, isCharacterFace } from '../abilities/dual-faced.js';
import type { CardID, Layer } from '@icgame/shared';
import { canUseSkill, markSkillUsed } from './usage.js';
import { canMakeSuccessfulUnlock } from './masterSkills.js';
import { applyUranusFirmamentMoveDiscard } from './masterWorldviews.js';

// === 穿行者 · 支助 ===
// 对照：docs/manual/05-dream-thieves.md 穿行者
// 出牌阶段：可将所有手牌（最少 1 张）给另一位玩家，然后移动到该玩家所在层
// 次数：卡面与说明书都没有「限一次」，不限次数；代价是交出全部手牌（至少 1 张）

export const TOURIST_SKILL_ID = 'thief_tourist.skill_0';

/** 校验穿行者支助技能是否可用 */
export function canUseTouristAssist(state: SetupState, selfID: string, targetID: string): boolean {
  if (selfID === targetID) return false;
  const self = state.players[selfID];
  const target = state.players[targetID];
  if (!self || !target) return false;
  if (self.characterId !== 'thief_tourist') return false;
  if (!self.isAlive || !target.isAlive) return false;
  if (self.hand.length < 1) return false;
  return true;
}

/** 穿行者技能：手牌全转给 target + 自己移到 target 所在层 */
export function applyTouristAssist(
  state: SetupState,
  selfID: string,
  targetID: string,
): SetupState | null {
  if (!canUseTouristAssist(state, selfID, targetID)) return null;
  const self = state.players[selfID]!;
  const target = state.players[targetID]!;

  // 转移手牌
  let s: SetupState = {
    ...state,
    players: {
      ...state.players,
      [selfID]: { ...state.players[selfID]!, hand: [] },
      [targetID]: {
        ...state.players[targetID]!,
        hand: [...state.players[targetID]!.hand, ...self.hand],
      },
    },
  };
  // 自己移动到 target 层
  s = movePlayerToLayer(s, selfID, target.currentLayer);
  return incrementMoveCounter(s);
}

// === 殉道者 · 牺牲 ===
// 略过出牌阶段，掷 1 骰；3-6 改变当层心锁 ±2（不超原值）；自杀 + 弃手牌
export const MARTYR_SKILL_ID = 'thief_martyr.skill_0';

export interface MartyrOutcome {
  state: SetupState;
  rolled: number;
  heartLockChanged: boolean;
}

/** 殉道者·牺牲；direction='increase'|'decrease'，受 originalHeartLock 上限 */
export function applyMartyrSacrifice(
  state: SetupState,
  selfID: string,
  roll: number,
  direction: 'increase' | 'decrease',
  originalHeartLockCap: number,
): MartyrOutcome | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_martyr') return null;
  if (!player.isAlive) return null;
  if (player.currentLayer < 1) return null;

  const layer = state.layers[player.currentLayer];
  if (!layer) return null;
  // 减少心锁算本回合的成功解锁（R-23）：本回合已经解锁过就不能选减少
  if (direction === 'decrease' && !canMakeSuccessfulUnlock(state, player)) return null;

  let s = markSkillUsed(state, selfID, MARTYR_SKILL_ID);

  // 自杀 + 弃手牌（无论骰值）：自己进迷失层，不是被击杀，没有凶手，手牌进弃牌堆
  s = discardCards(s, selfID, [...player.hand]);
  s = sendToLimbo(s, selfID);

  let heartLockChanged = false;
  if (roll >= 3 && roll <= 6) {
    const cur = layer.heartLockValue;
    const delta = direction === 'increase' ? 2 : -2;
    let next = cur + delta;
    next = Math.max(0, Math.min(originalHeartLockCap, next));
    if (next !== cur) {
      heartLockChanged = true;
      s = setLayerHeartLock(s, player.currentLayer, next, { actorID: selfID, bySkill: true });
    }
  }

  return { state: s, rolled: roll, heartLockChanged };
}

// === 筑梦师 · 迷宫 ===
// 弃 1 SHOOT 类牌；同层 1 玩家在其下回合结束前不受行动牌+技能影响、不能移动
export const ARCHITECT_SKILL_ID = 'thief_architect.skill_0';

/**
 * SHOOT 类牌的 id（与牌库配置一致：SHOOT / 刺客之王 / 爆甲螺旋 / 炸裂弹头 / 梦境穿梭剂）。
 * 引擎里所有「SHOOT 类」的判断都复用 isShootClassCard，不要各自再列清单。
 * 死亡宣言只作为附加牌随 SHOOT 打出、不单独出，不在此列。
 * 对照：docs/manual/04-action-cards.md；docs/manual/06-dream-master.md 梦境穿梭剂视为 SHOOT 类
 */
const SHOOT_CLASS_CARD_IDS: ReadonlySet<string> = new Set([
  'action_shoot',
  'action_shoot_assassin',
  'action_shoot_drill',
  'action_shoot_burst',
  'action_shoot_dream_transit',
]);

/** 是否 SHOOT 类牌（迷宫弃牌门禁、炸裂弹头弃牌等） */
export function isShootClassCard(cardId: CardID): boolean {
  return SHOOT_CLASS_CARD_IDS.has(cardId);
}

// 迷宫允许的行动牌（对照：docs/manual/05-dream-thieves.md 筑梦师）
const MAZE_ALLOWED_MOVES = new Set([
  'playShoot',
  'playShootAssassin',
  'playShootDrill',
  'playShootBurst',
  'playShootDreamTransit',
  'playUnlock',
  'playPeek',
  'playTelekinesis',
  'playDeathDecree',
  'playTimeStorm',
  'playNightmareUnlock',
  'playGreenRayArrest',
]);

/** 检查目标是否被迷宫影响且当前 move 不在白名单 */
export function isMazeBlocked(state: SetupState, targetID: string, moveName: string): boolean {
  if (!state.mazeState) return false;
  if (state.mazeState.mazedPlayerID !== targetID) return false;
  return !MAZE_ALLOWED_MOVES.has(moveName);
}

/**
 * KICK 的效果：与目标玩家交换梦境层；双方各自按天王星·苍穹世界观结算（同层互换不算改变层数）。
 * 出牌路径（playKick）与金星·镜界复制路径共用。目标不合法或被筑梦师·迷宫困住时返回 null。
 * 对照：docs/manual/04-action-cards.md KICK；docs/manual/05-dream-thieves.md 筑梦师
 */
export function applyKickEffect(
  state: SetupState,
  selfID: string,
  targetID: string,
): SetupState | null {
  if (isMazeBlocked(state, targetID, 'playKick')) return null;
  const self = state.players[selfID];
  const target = state.players[targetID];
  if (!self || !target) return null;
  if (selfID === targetID) return null;
  if (!self.isAlive || !target.isAlive) return null;
  const sameLayer = self.currentLayer === target.currentLayer;
  let s = movePlayerToLayer(state, selfID, target.currentLayer);
  s = movePlayerToLayer(s, targetID, self.currentLayer);
  // 天王星·苍穹世界观：每位因行动牌改变层数的盗梦者各触发一次（同层 KICK 不算改变）
  if (!sameLayer) {
    s = applyUranusFirmamentMoveDiscard(s, selfID);
    s = applyUranusFirmamentMoveDiscard(s, targetID);
  }
  return s;
}

// === 影子 · 潜伏 ===
// 出牌阶段可随时移到梦主所在层
export const SHADE_SKILL_ID = 'thief_shade.skill_0';

export function applyShadeFollow(state: SetupState, selfID: string): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_shade') return null;
  if (!player.isAlive) return null;
  const masterID = state.dreamMasterID;
  const master = state.players[masterID];
  if (!master || !master.isAlive) return null;
  if (master.currentLayer < 1) return null; // 梦主在迷失层不能跟随
  if (player.currentLayer === master.currentLayer) return null;
  // 不计入 skillUsed（"随时"暗示无次数限制）
  const s = movePlayerToLayer(state, selfID, master.currentLayer);
  return s;
}

// === 降世神通 · 顺流 ===
// 移到数字更大的梦境时，可从牌库顶抽 2 张（被动 hook）
export const HLNINO_SKILL_ID = 'thief_hlnino.skill_0';

export function applyHlninoFlow(
  state: SetupState,
  playerID: string,
  fromLayer: number,
  toLayer: number,
): SetupState {
  const player = state.players[playerID];
  if (!player || player.characterId !== 'thief_hlnino') return state;
  if (!player.isAlive) return state;
  if (toLayer <= fromLayer) return state;
  // 抽 2 张（不计 skillUsed，因被动且每次移动都触发）
  return drawCards(state, playerID, 2);
}

/**
 * 降世神通·降临的统一收口：一个 move 结算完后，对比回合主人的层数。
 * 条件：回合主人是活着的降世神通，处于自己的出牌阶段，且这一个 move 让他到达了数字更大的梦境
 * （迷失层按 0 算，复活自己即 0 → 1）。梦境穿梭剂、SHOOT·梦境穿梭剂、KICK 换层、复活、
 * 各类技能与世界观造成的上移都由此触发，不必在每个 move 里各接一次；别人回合里被移动不算。
 * 对照：docs/manual/05-dream-thieves.md 降世神通；docs/manual/08-appendix.md「移动」词条
 */
export function applyHlninoAscent(before: SetupState, after: SetupState): SetupState {
  if (before.turnPhase !== 'action' || after.turnPhase !== 'action') return after;
  const pid = before.currentPlayerID;
  if (after.currentPlayerID !== pid) return after;
  const prev = before.players[pid];
  const next = after.players[pid];
  if (!prev || !next || prev.characterId !== 'thief_hlnino') return after;
  if (!next.isAlive) return after;
  return applyHlninoFlow(after, pid, prev.isAlive ? prev.currentLayer : 0, next.currentLayer);
}

// === 黑洞 · 吸纳（出牌阶段，指定相邻层，该层所有玩家移到黑洞所在层） ===
export const BLACK_HOLE_ABSORB_SKILL_ID = 'thief_black_hole.skill_1';

export function applyBlackHoleAbsorb(
  state: SetupState,
  selfID: string,
  targetLayer: number,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_black_hole') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, BLACK_HOLE_ABSORB_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  const selfLayer = player.currentLayer;
  if (selfLayer <= 0 || selfLayer > 4) return null;
  // 相邻层检查
  if (targetLayer !== selfLayer - 1 && targetLayer !== selfLayer + 1) return null;
  if (targetLayer <= 0 || targetLayer > 4) return null;
  const targetLayerInfo = state.layers[targetLayer];
  if (!targetLayerInfo) return null;
  const migrants = targetLayerInfo.playersInLayer.filter((id) => state.players[id]?.isAlive);
  if (migrants.length === 0) return null;

  const s = markSkillUsed(state, selfID, BLACK_HOLE_ABSORB_SKILL_ID);
  const newPlayers = { ...s.players };
  for (const pid of migrants) {
    newPlayers[pid] = { ...newPlayers[pid]!, currentLayer: selfLayer };
  }
  // 更新层内玩家列表
  const newLayers = { ...s.layers };
  newLayers[selfLayer] = {
    ...newLayers[selfLayer]!,
    playersInLayer: [...newLayers[selfLayer]!.playersInLayer, ...migrants],
  };
  newLayers[targetLayer] = {
    ...newLayers[targetLayer]!,
    playersInLayer: newLayers[targetLayer]!.playersInLayer.filter((id) => !migrants.includes(id)),
  };
  return { ...s, players: newPlayers, layers: newLayers };
}

// === 空间女王 · 监察（纯函数） ===
// 技能 1：另一玩家成功解锁时，可抽 1
// 技能 2：任意玩家弃牌阶段，可放 1 手牌到牌库顶
export const SPACE_QUEEN_OBSERVE_SKILL_ID = 'thief_space_queen.skill_0';
export const SPACE_QUEEN_TOP_SKILL_ID = 'thief_space_queen.skill_1';

/** 空间女王技能 1：抽 1（响应他人解锁；纯函数） */
export function applySpaceQueenObserve(state: SetupState, selfID: string): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_space_queen') return null;
  if (!player.isAlive) return null;
  return drawCards(state, selfID, 1);
}

/**
 * 解封成功后结算空间女王·监察：每位存活的空间女王抽 1，按座次依次结算。
 * 对照：docs/manual/05-dream-thieves.md 空间女王
 */
export function settleSpaceQueenObserve(state: SetupState): SetupState {
  let current = state;
  for (const playerID of state.playerOrder) {
    const player = state.players[playerID];
    if (!player || !player.isAlive) continue;
    if (player.characterId !== 'thief_space_queen') continue;
    current = applySpaceQueenObserve(current, playerID) ?? current;
  }
  return current;
}

/** 空间女王技能 2：放 1 手牌到牌库顶（纯函数） */
export function applySpaceQueenStashTop(
  state: SetupState,
  selfID: string,
  cardId: CardID,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_space_queen') return null;
  if (!player.isAlive) return null;
  const idx = player.hand.indexOf(cardId);
  if (idx === -1) return null;
  const newHand = [...player.hand];
  newHand.splice(idx, 1);
  return {
    ...state,
    players: { ...state.players, [selfID]: { ...player, hand: newHand } },
    deck: { ...state.deck, cards: [cardId, ...state.deck.cards] },
  };
}

// === 双子 · 协同 ===
// 弃牌阶段：梦主层数 > self 层数时，可掷骰 → 4 / 5 / 6 → 当层 -2 心锁 → 翻面
// 对照：docs/manual/05-dream-thieves.md 双子·命运（卡面为三个骰面 4、5、6）
/** 双面角色的正面 id；按面区分技能靠 isCharacterFace */
const GEMINI_FRONT_ID = 'thief_gemini' as CardID;
export const PISCES_FRONT_ID = 'thief_pisces' as CardID;
export const LUNA_FRONT_ID = 'thief_luna' as CardID;

export const GEMINI_SKILL_ID = 'thief_gemini.skill_0';

export function applyGeminiSync(
  state: SetupState,
  selfID: string,
  roll: number,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || !isCharacterFace(player.characterId, GEMINI_FRONT_ID, 'front')) return null;
  if (!player.isAlive) return null;
  if (player.currentLayer < 1) return null;
  const master = state.players[state.dreamMasterID];
  if (!master) return null;
  if (master.currentLayer <= player.currentLayer) return null;
  if (!canUseSkill(player, GEMINI_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  // 减少心锁算本回合的成功解锁（R-23）：本回合已经解锁过就不能发动
  if (!canMakeSuccessfulUnlock(state, player)) return null;

  let s = markSkillUsed(state, selfID, GEMINI_SKILL_ID);
  if (roll >= 4 && roll <= 6) {
    const layerInfo = s.layers[player.currentLayer]!;
    s = setLayerHeartLock(s, player.currentLayer, layerInfo.heartLockValue - 2, {
      actorID: selfID,
      bySkill: true,
    });
  }
  // 翻面（无论骰值）
  s = flipCharacter(s, selfID);
  return s;
}

// === 双子 · 抉择（skill_1）===
// 出牌阶段：梦主层 < self 层时，掷 2 骰 → 从牌库顶抽 (骰 1 + 骰 2) 张 → 翻面
// 对照：docs/manual/05-dream-thieves.md 双子 83-89 行
export const GEMINI_CHOICE_SKILL_ID = 'thief_gemini.skill_1';

export function applyGeminiChoice(
  state: SetupState,
  selfID: string,
  roll1: number,
  roll2: number,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || !isCharacterFace(player.characterId, GEMINI_FRONT_ID, 'back')) return null;
  if (!player.isAlive) return null;
  if (player.currentLayer < 1) return null;
  const master = state.players[state.dreamMasterID];
  if (!master) return null;
  if (master.currentLayer >= player.currentLayer) return null;
  if (!canUseSkill(player, GEMINI_CHOICE_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  if (roll1 < 1 || roll1 > 6 || roll2 < 1 || roll2 > 6) return null;

  let s = markSkillUsed(state, selfID, GEMINI_CHOICE_SKILL_ID);
  const drawN = roll1 + roll2;
  if (drawN > 0) {
    s = drawCards(s, selfID, drawN);
  }
  // 翻面（skill_0 + skill_1 共用翻面机制；任一用过后均翻面）
  s = flipCharacter(s, selfID);
  return s;
}

// === 双鱼 · 洗礼（skill_1）===
// 出牌阶段：移到数字更大的相邻层 + 可选复活 1 玩家到新层 → 翻面
// 对照：docs/manual/05-dream-thieves.md 双鱼 55-60 行
// 规则：在 L4 无法启动；迷失层也不能启动；复活为可选（reviveID=null 代表仅移动+翻面）
export const PISCES_BLESSING_SKILL_ID = 'thief_pisces.skill_1';

export function applyPiscesBlessing(
  state: SetupState,
  selfID: string,
  reviveID: string | null,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || !isCharacterFace(player.characterId, PISCES_FRONT_ID, 'back')) return null;
  if (!player.isAlive) return null;
  if (player.currentLayer < 1 || player.currentLayer >= 4) return null;
  if (!canUseSkill(player, PISCES_BLESSING_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  const newLayer = (player.currentLayer + 1) as Layer;
  let s = markSkillUsed(state, selfID, PISCES_BLESSING_SKILL_ID);
  s = movePlayerToLayer(s, selfID, newLayer);

  if (reviveID !== null) {
    const target = s.players[reviveID];
    if (!target || target.isAlive) return null;
    if (reviveID === selfID) return null;
    // 复活到双鱼新所在层
    s = {
      ...s,
      players: {
        ...s.players,
        [reviveID]: { ...target, isAlive: true, deathTurn: null, layerBeforeLimbo: null },
      },
    };
    s = movePlayerToLayer(s, reviveID, newLayer);
  }

  s = flipCharacter(s, selfID);
  return s;
}

// === 盖亚 · 撼动 ===
// 出牌阶段：选定一个方向（-1 或 +1），令同层其余玩家全部移到「所在层数 ± 1」的梦境；盖亚自己不动。
// 不能只挑部分人，也不能因此进入迷失层（第 1 层不能选 -1，第 4 层不能选 +1）。回合限 2 次。
// 对照：docs/manual/05-dream-thieves.md 盖亚（第 30 行技能、第 33 行详述「所有当层其余玩家都必须到你指定的相邻一层梦境」）
export const GAIA_SKILL_ID = 'thief_gaia.skill_0';
const GAIA_LIMIT_PER_TURN = 2;

export function applyGaiaShift(
  state: SetupState,
  selfID: string,
  delta: -1 | 1,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_gaia') return null;
  if (!player.isAlive) return null;
  if (delta !== -1 && delta !== 1) return null;
  if (!canUseSkill(player, GAIA_SKILL_ID, 'ownTurnLimitN', GAIA_LIMIT_PER_TURN)) return null;
  const layerInfo = state.layers[player.currentLayer];
  if (!layerInfo) return null;
  // 目标层必须是梦境层（1-4），不能进入迷失层，也不能超出第 4 层
  const targetLayer = player.currentLayer + delta;
  if (targetLayer < 1 || targetLayer > 4) return null;
  // 同层其余玩家全部移动；一个人都没有时技能不产生任何效果，不能发动
  const others = layerInfo.playersInLayer.filter((id) => id !== selfID);
  if (others.length === 0) return null;

  let s = markSkillUsed(state, selfID, GAIA_SKILL_ID);
  for (const pid of others) {
    s = movePlayerToLayer(s, pid, targetLayer as Layer);
  }
  return s;
}

// === 白羊 · 解封者（纯函数） ===
// 1: 盗梦者被杀时翻当层梦魇（响应触发）
// 2: 弃掉的梦魇牌每张让 self 抽牌阶段 +1
export const ARIES_REVEAL_SKILL_ID = 'thief_aries.skill_0';
export const ARIES_DRAW_SKILL_ID = 'thief_aries.skill_1';

/** 白羊·已弃梦魇加成抽 N（N = 已弃梦魇数）：发动过的和直接弃掉的梦魇牌都计入 */
export function ariesExtraDrawCount(state: SetupState): number {
  return state.usedNightmareIds.length;
}

/** 这名玩家的抽牌阶段最多可以多抽几张：存活的白羊 = 已弃梦魇数，其他人（含已死亡的白羊）为 0 */
export function ariesExtraDrawLimit(state: SetupState, playerID: string): number {
  const player = state.players[playerID];
  if (!player || !player.isAlive || player.characterId !== 'thief_aries') return 0;
  return ariesExtraDrawCount(state);
}

/**
 * 白羊·闪耀：抽牌阶段由白羊本人（且必须是当前回合玩家、存活）多抽牌。
 * chosen 是白羊自己选的多抽张数（0 到上限）；不给时抽满上限。超出上限的部分按上限截断，
 * 参数是否合法由 doDraw 在抽牌前校验。
 * 对照：docs/manual/05-dream-thieves.md 白羊（第 70 行「可以让玩家自行选择抽取数量」）
 * 按座次遍历存活玩家，只有「当前回合的白羊」满足条件，至多抽一次。
 */
export function settleAriesExtraDraw(state: SetupState, chosen?: number | null): SetupState {
  let current = state;
  for (const playerID of state.playerOrder) {
    if (playerID !== current.currentPlayerID) continue;
    const limit = ariesExtraDrawLimit(current, playerID);
    const extra = Math.min(chosen ?? limit, limit);
    if (extra > 0) current = drawCards(current, playerID, extra);
  }
  return current;
}

/** doDraw 带的多抽张数是否合法：没给（undefined / null）永远合法；给了就必须是存活白羊、整数且在 0 到上限之内 */
export function isValidAriesExtraChoice(
  state: SetupState,
  playerID: string,
  chosen: unknown,
): boolean {
  if (chosen === undefined || chosen === null) return true;
  const player = state.players[playerID];
  if (!player || !player.isAlive || player.characterId !== 'thief_aries') return false;
  return (
    typeof chosen === 'number' &&
    Number.isInteger(chosen) &&
    chosen >= 0 &&
    chosen <= ariesExtraDrawLimit(state, playerID)
  );
}

// === 白羊 · 星尘（skill_0）===
// onKilled 简化响应窗口：盗梦者被击杀时，白羊可选择"发动或弃掉该玩家所在层的未翻梦魇牌"
// 对照：docs/manual/05-dream-thieves.md 白羊 62-71 行
// 规则：只能二选一，不能保留；白羊自己被击杀时同样可触发（victim=self 时白羊已死，由规则自动跳过）
// 本批次实装：纯函数 + pendingAriesChoice 简化 pending；SHOOT 击杀路径同步接入挂起

export const ARIES_STARDUST_SKILL_ID = 'thief_aries.skill_0';

/** 找唯一活着的白羊（返回 playerID 或 null） */
export function findAliveAriesID(state: SetupState): string | null {
  for (const pid of state.playerOrder) {
    const p = state.players[pid];
    if (p && p.isAlive && p.characterId === 'thief_aries') return pid;
  }
  return null;
}

/** 白羊·星尘 触发条件：白羊存活、被击杀者在非迷失层、该层存在未翻梦魇牌 */
export function canAriesStardustTrigger(
  state: SetupState,
  victimID: string,
  victimLayerBeforeDeath: number,
): boolean {
  const ariesID = findAliveAriesID(state);
  if (!ariesID) return false;
  if (ariesID === victimID) return false; // 白羊自己被击杀时不触发（规则保守实现）
  if (victimLayerBeforeDeath < 1) return false;
  const ls = state.layers[victimLayerBeforeDeath as Layer];
  if (!ls) return false;
  if (!ls.nightmareId) return false;
  if (ls.nightmareRevealed) return false;
  return true;
}

/** 白羊·星尘 · 弃掉分支：将该层未翻梦魇牌弃入 usedNightmareIds（联动闪耀）并清空 pending */
export function applyAriesStardustDiscard(state: SetupState): SetupState | null {
  const pending = state.pendingAriesChoice;
  if (!pending) return null;
  const ls = state.layers[pending.victimLayer as Layer];
  if (!ls || !ls.nightmareId || ls.nightmareRevealed) return null;
  const nid = ls.nightmareId;
  return {
    ...state,
    layers: {
      ...state.layers,
      [pending.victimLayer]: {
        ...ls,
        nightmareId: null,
        nightmareTriggered: true,
      },
    },
    usedNightmareIds: [...state.usedNightmareIds, nid],
    pendingAriesChoice: null,
  };
}

/** 白羊·星尘 · 发动分支的准备：翻开梦魇 + 清 pending（梦魇效果的实际分发由 moves/responses.ts 的 move 执行） */
export function applyAriesStardustReveal(state: SetupState): SetupState | null {
  const pending = state.pendingAriesChoice;
  if (!pending) return null;
  const ls = state.layers[pending.victimLayer as Layer];
  if (!ls || !ls.nightmareId || ls.nightmareRevealed) return null;
  return {
    ...state,
    layers: {
      ...state.layers,
      [pending.victimLayer]: {
        ...ls,
        nightmareRevealed: true,
      },
    },
    pendingAriesChoice: null,
  };
}

// === 巨蟹 · 气场 + 庇佑（纯被动）===
// 对照：docs/manual/05-dream-thieves.md 巨蟹（90-99 行）
// 气场：所在层所有玩家抽牌阶段 +1（强制性）
// 庇佑：所在层所有玩家无手牌上限（弃牌阶段检验）
// 规则：迷失层(0)不触发；巨蟹自己也享受（manual "所在层的所有玩家"含自己）

export const CANCER_AURA_SKILL_ID = 'thief_cancer.skill_0';
export const CANCER_SHELTER_SKILL_ID = 'thief_cancer.skill_1';

/** 判断指定玩家当前是否与活着的巨蟹同层（含自己是巨蟹的情形），迷失层/死亡状态不计 */
function isSameLayerAsAliveCancer(state: SetupState, playerID: string): boolean {
  const p = state.players[playerID];
  if (!p || !p.isAlive) return false;
  if (p.currentLayer < 1) return false;
  const layerInfo = state.layers[p.currentLayer as Layer];
  if (!layerInfo) return false;
  for (const pid of layerInfo.playersInLayer) {
    const other = state.players[pid];
    if (other && other.isAlive && other.characterId === 'thief_cancer') return true;
  }
  return false;
}

/** 巨蟹·气场：同层抽牌 +1（同层且巨蟹活着、非迷失层） */
export function getCancerAuraBonus(state: SetupState, playerID: string): number {
  return isSameLayerAsAliveCancer(state, playerID) ? 1 : 0;
}

/** 巨蟹·庇佑：同层玩家无手牌上限（弃牌阶段检验） */
export function isCancerShelterActive(state: SetupState, playerID: string): boolean {
  return isSameLayerAsAliveCancer(state, playerID);
}
