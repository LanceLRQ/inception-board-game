// 盗梦者技能 · SHOOT 与掷骰：改骰、改目标、跨层、击杀相关
// 对照：docs/manual/05-dream-thieves.md

import type { SetupState, PlayerSetup } from '../../setup.js';
import { drawCards, movePlayerToLayer, discardCards, setLayerHeartLock } from '../../stateOps.js';
import { killPlayer, SAGITTARIUS_KILLS_THIS_TURN_KEY } from '../death.js';
import { flipCharacter, isCharacterFace } from '../abilities/dual-faced.js';
import type { CardID, Layer } from '@icgame/shared';
import { canUseSkill, markSkillUsed } from './usage.js';
import { PISCES_FRONT_ID, LUNA_FRONT_ID } from './thiefMovement.js';
import { canMakeSuccessfulUnlock } from './masterSkills.js';

// === 摩羯 · 节奏 ===
// 对照：docs/manual/05-dream-thieves.md 摩羯
// 被动：若手牌数 >= 所在层数字，则使用的 SHOOT 类不受层数限制 + 解封次数不受限制
// 注意：摩羯效果是被动的，不进入 skillUsedThisTurn 计数

export const CAPRICORNUS_SKILL_ID = 'thief_capricornus.skill_0';

/** 摩羯节奏判定：玩家是否处于"节奏"激活状态 */
export function isCapricornusRhythmActive(player: PlayerSetup): boolean {
  if (player.characterId !== 'thief_capricornus') return false;
  if (!player.isAlive) return false;
  // 迷失层（0 层）不激活
  if (player.currentLayer < 1) return false;
  return player.hand.length >= player.currentLayer;
}

// === 意念判官 · 定罪（双骰择其一）===
// 对照：docs/manual/05-dream-thieves.md 意念判官
// 使用 SHOOT 时，target 改为掷 2 颗骰，由 self 选 1 颗作为结果。
//
// engine 纯函数：传入双骰 + 选择，返回最终骰值

export const SUDGER_SKILL_ID = 'thief_sudger_of_mind.skill_0';

/** 意念判官：从 2 个骰值中按选择返回 */
export function applySudgerVerdict(rollA: number, rollB: number, pick: 'A' | 'B'): number {
  return pick === 'A' ? rollA : rollB;
}

// === 天蝎 · 毒针（双骰差值）===
// 对照：docs/manual/05-dream-thieves.md 天蝎
// 使用 SHOOT 时，可让 target 改为掷 2 骰，结果取差值；0 视为 1。回合限 1 次。

export const SCORPIUS_SKILL_ID = 'thief_scorpius.skill_0';

/** 天蝎：双骰差值（绝对值，0 视为 1） */
export function applyScorpiusPoison(rollA: number, rollB: number): number {
  const diff = Math.abs(rollA - rollB);
  return diff === 0 ? 1 : diff;
}

// === 金牛 · 号角（对掷比大小）===
// 对照：docs/manual/05-dream-thieves.md 金牛
// 使用 SHOOT 时，target 掷骰后 self 可掷 1 骰；若 self > target 则击杀 target，否则按原 SHOOT 效果结算。
//
// engine 纯函数：返回 'kill' 表示击杀，'normal' 表示按原效果结算

export const TAURUS_SKILL_ID = 'thief_taurus.skill_0';

export type TaurusOutcome = 'kill' | 'normal';

/** 金牛：对掷判定 */
export function applyTaurusHorn(targetRoll: number, selfRoll: number): TaurusOutcome {
  return selfRoll > targetRoll ? 'kill' : 'normal';
}

// === 灵雕师 · 雕琢 ===
// 使用 SHOOT 时，掷骰后用 target 手牌数作为最终骰值；不可被改
export const SOUL_SCULPTOR_SKILL_ID = 'thief_soul_sculptor.skill_0';

/** 灵雕师·雕琢：用 target 手牌数替换骰值（限 [1,6]） */
export function applySoulSculptorCarve(targetHandCount: number): number {
  return Math.max(1, Math.min(6, targetHandCount));
}

// === 哈雷 · 冲击 ===
// 成功解封后，视为对另一玩家使用 1 张 SHOOT，掷骰结果 -2
export const HALEY_SKILL_ID = 'thief_haley.skill_0';

/** 哈雷·冲击：附带 -2 修饰的骰值（[1,6] clamp） */
export function applyHaleyImpact(rawRoll: number): number {
  return Math.max(1, Math.min(6, rawRoll - 2));
}

// === 雅典娜 · 惊叹 ===
// 展示 4 手牌 + 1 牌库顶；若 5 张同名（互不重复）→ 击杀同层 1 玩家，取手牌
export const ATHENA_AWE_SKILL_ID = 'thief_athena.skill_1';

/** 雅典娜·惊叹：5 张牌名是否全部互不相同 */
export function checkAthenaAweCondition(cards: readonly CardID[]): boolean {
  if (cards.length !== 5) return false;
  const set = new Set<string>(cards);
  return set.size === 5;
}

/** 雅典娜·惊叹：执行（fail 则技能仍消耗） */
export function applyAthenaAwe(
  state: SetupState,
  selfID: string,
  shownHandIds: readonly CardID[], // 4 张展示的手牌 cardId
  targetID: string,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_athena') return null;
  if (!player.isAlive) return null;
  if (selfID === targetID) return null;
  if (!canUseSkill(player, ATHENA_AWE_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  if (shownHandIds.length !== 4) return null;

  // 4 张必须都在手中（multiset）
  const handCopy = [...player.hand];
  for (const id of shownHandIds) {
    const idx = handCopy.indexOf(id);
    if (idx === -1) return null;
    handCopy.splice(idx, 1);
  }

  // 牌库为空时不能触发
  if (state.deck.cards.length === 0) return null;
  const deckTop = state.deck.cards[0]!;

  const target = state.players[targetID];
  if (!target || !target.isAlive) return null;
  if (target.currentLayer !== player.currentLayer) return null;

  const s = markSkillUsed(state, selfID, ATHENA_AWE_SKILL_ID);

  // 5 张牌名是否全不同
  const all5 = [...shownHandIds, deckTop];
  const success = checkAthenaAweCondition(all5);

  if (!success) {
    // 失败：仍消耗技能 + 牌库顶不动（仅展示）
    return s;
  }

  // 成功：击杀 target，取其全部手牌
  return killPlayer(s, targetID, selfID, Number.POSITIVE_INFINITY);
}

// === 处女 · 完美 ===
// 当任意玩家掷出 6 时可触发：复活一位己方角色 / 抽 2 张 / 移到任意层
// 对照：docs/manual/05-dream-thieves.md 处女
export const VIRGO_SKILL_ID = 'thief_virgo.skill_0';

export type VirgoPerfectChoice = 'revive' | 'draw_two' | 'teleport';

/** 处女完美触发条件：任意玩家骰 6 */
export function isVirgoPerfectTriggered(rawRoll: number): boolean {
  return rawRoll === 6;
}

/**
 * SHOOT 结算后检查处女·完美：本次 SHOOT 的最终点数为 6 时，存活的处女挂起 pendingVirgoChoice
 * 等待三选一（由 respondVirgoPerfect move 执行）。
 *   - 最终点数是经 M4、狂热、雕琢、毒针等修正之后的结果，不是原始 D6（G.lastShootRoll 只供动画）
 *   - 没有掷骰的结算（双鱼·游离躲开）不调用本函数，因此不触发
 *   - 已有挂起的选择时不重入
 * shooterID 取当前回合玩家（best-effort 记录）。
 */
export function settleVirgoPerfect(state: SetupState, shootRoll: number): SetupState {
  if (!isVirgoPerfectTriggered(shootRoll)) return state;
  let current = state;
  for (const playerID of state.playerOrder) {
    const player = state.players[playerID];
    if (!player || !player.isAlive) continue;
    if (player.characterId !== 'thief_virgo') continue;
    if (current.pendingVirgoChoice) continue;
    current = {
      ...current,
      pendingVirgoChoice: {
        virgoID: playerID,
        triggerRoll: shootRoll,
        shooterID: current.currentPlayerID,
      },
    };
  }
  return current;
}

/**
 * 处女·完美 · 选项一：复活一位玩家
 * 对照：docs/manual/05-dream-thieves.md 处女「复活一位玩家」；
 *       docs/manual/08-appendix.md 盗梦十诫（复活他人：被复活者移动到自己所在层）
 *  - virgo 必须存活
 *  - target 必须死亡，不限阵营（含梦主、背叛者）
 *  - target 复活到处女所在层 + deathTurn=null + isAlive=true
 *  - target 的手牌保留
 */
export function applyVirgoResurrect(
  state: SetupState,
  virgoID: string,
  targetID: string,
): SetupState | null {
  const virgo = state.players[virgoID];
  if (!virgo || virgo.characterId !== 'thief_virgo') return null;
  if (!virgo.isAlive) return null;
  if (virgoID === targetID) return null;

  const target = state.players[targetID];
  if (!target) return null;
  if (target.isAlive) return null;

  const s: SetupState = {
    ...state,
    players: {
      ...state.players,
      [targetID]: {
        ...target,
        isAlive: true,
        deathTurn: null,
        layerBeforeLimbo: null,
      },
    },
  };
  return movePlayerToLayer(s, targetID, virgo.currentLayer);
}

/**
 * 处女·完美 · 选项二：从牌库顶抽 2 张
 *  - virgo 必须存活
 *  - 牌库不足时抽到尽（drawCards 已处理）
 */
export function applyVirgoDrawTwo(state: SetupState, virgoID: string): SetupState | null {
  const virgo = state.players[virgoID];
  if (!virgo || virgo.characterId !== 'thief_virgo') return null;
  if (!virgo.isAlive) return null;
  return drawCards(state, virgoID, 2);
}

/**
 * 处女·完美 · 选项三：传送到任一梦境层（1-4，不含迷失层 0）
 *  - virgo 必须存活
 *  - layer 必须 1-4
 *  - 不限相邻
 */
export function applyVirgoTeleport(
  state: SetupState,
  virgoID: string,
  layer: number,
): SetupState | null {
  const virgo = state.players[virgoID];
  if (!virgo || virgo.characterId !== 'thief_virgo') return null;
  if (!virgo.isAlive) return null;
  if (!Number.isInteger(layer) || layer < 1 || layer > 4) return null;
  return movePlayerToLayer(state, virgoID, layer as Layer);
}

// === 恐怖分子 · 远程（SHOOT 跨层被动） ===
// 与摩羯·节奏类似：使用的 SHOOT 类不受层数限制（被动，无激活条件）
// 第二技能（target 弃牌否则骰-1）需响应窗口，留待批次

export const TERRORIST_SKILL_ID = 'thief_terrorist.skill_0';

export function isTerroristCrossLayerActive(player: PlayerSetup): boolean {
  if (player.characterId !== 'thief_terrorist') return false;
  if (!player.isAlive) return false;
  return true;
}

// === 双鱼 · 闪避 ===
// 成为 SHOOT 目标时，可移到数字更小相邻层忽略 SHOOT 效果 → 翻面
// 接入：在 applyShootVariant 前置 hook 检查（被动）
export const PISCES_SKILL_ID = 'thief_pisces.skill_0';

/**
 * 双鱼·游离是否可发动（正面朝上 + 活着在 1-4 层）。
 * 第 1 层同样能发动：移到「数字更小的相邻层」即进入迷失层。
 * 对照：docs/manual/05-dream-thieves.md 双鱼（详述第一层仍可启动游离）
 */
export function canPiscesEvade(player: PlayerSetup): boolean {
  if (!isCharacterFace(player.characterId, PISCES_FRONT_ID, 'front')) return false;
  if (!player.isAlive) return false;
  if (player.currentLayer < 1) return false;
  if (!canUseSkill(player, PISCES_SKILL_ID, 'ownTurnOncePerTurn')) return false;
  return true;
}

/** 执行双鱼闪避：移到 currentLayer-1（第 1 层则进入迷失层，不算被击杀）+ 翻面 */
export function applyPiscesEvade(state: SetupState, selfID: string): SetupState | null {
  const player = state.players[selfID];
  if (!player || !canPiscesEvade(player)) return null;
  let s = markSkillUsed(state, selfID, PISCES_SKILL_ID);
  s = movePlayerToLayer(s, selfID, (player.currentLayer - 1) as Layer);
  s = flipCharacter(s, selfID);
  return s;
}

// === 露娜 · 月蚀 ===
// 出牌阶段：弃 2 张 SHOOT 击杀同层任意玩家 → 翻面
export const LUNA_SKILL_ID = 'thief_luna.skill_0';

export function applyLunaEclipse(
  state: SetupState,
  selfID: string,
  shootCardIds: readonly CardID[],
  targetID: string,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || !isCharacterFace(player.characterId, LUNA_FRONT_ID, 'front')) return null;
  if (!player.isAlive) return null;
  if (selfID === targetID) return null;
  if (!canUseSkill(player, LUNA_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  if (shootCardIds.length !== 2) return null;
  // 必须都是 action_shoot（基础 SHOOT）
  for (const cid of shootCardIds) {
    if (cid !== 'action_shoot') return null;
  }
  const target = state.players[targetID];
  if (!target || !target.isAlive) return null;
  if (target.currentLayer !== player.currentLayer) return null;
  // 校验手牌
  const handCopy = [...player.hand];
  for (const cid of shootCardIds) {
    const idx = handCopy.indexOf(cid);
    if (idx === -1) return null;
    handCopy.splice(idx, 1);
  }

  let s = markSkillUsed(state, selfID, LUNA_SKILL_ID);
  // 弃 2 张 SHOOT 到弃牌堆
  s = discardCards(s, selfID, shootCardIds);
  // 击杀 target
  s = killPlayer(s, targetID, selfID);
  // 翻面
  s = flipCharacter(s, selfID);
  return s;
}

// === 射手 · 神射（纯函数） ===
// 1: SHOOT 目标移动时可不让其移动（响应）
// 2: 击杀 1 玩家后改 1 心锁（限 1 次）
export const SAGITTARIUS_NO_MOVE_SKILL_ID = 'thief_sagittarius.skill_0';
export const SAGITTARIUS_HEART_LOCK_SKILL_ID = 'thief_sagittarius.skill_1';

/**
 * 射手·穿心能否发动：本回合击杀过玩家（每次击杀换一次机会），且本回合还没发动过（回合限 1 次）。
 * 「击杀」只算射手作为凶手的击杀（killPlayer），别人被梦魇 / 世界观送进迷失层不算。
 * 对照：docs/manual/05-dream-thieves.md 射手 136 行
 */
export function canUseSagittariusHeartLock(state: SetupState, selfID: string): boolean {
  const self = state.players[selfID];
  if (!self || !self.isAlive || self.characterId !== 'thief_sagittarius') return false;
  if (!canUseSkill(self, SAGITTARIUS_HEART_LOCK_SKILL_ID, 'ownTurnOncePerTurn')) return false;
  const kills = self.skillUsedThisTurn[SAGITTARIUS_KILLS_THIS_TURN_KEY] ?? 0;
  const used = self.skillUsedThisTurn[SAGITTARIUS_HEART_LOCK_SKILL_ID] ?? 0;
  return kills > used;
}

/** 射手心锁修改：±1，受 cap 限制 */
export function applySagittariusHeartLock(
  state: SetupState,
  selfID: string,
  layer: number,
  delta: -1 | 1,
  cap: number,
): SetupState | null {
  const layerInfo = state.layers[layer];
  if (!layerInfo) return null;
  const actor = state.players[selfID];
  if (!actor) return null;
  // 减少心锁算本回合的成功解锁（R-23）：本回合已经解锁过就不能减少
  if (delta < 0 && !canMakeSuccessfulUnlock(state, actor)) return null;
  const next = Math.max(0, Math.min(cap, layerInfo.heartLockValue + delta));
  return setLayerHeartLock(state, layer, next, { actorID: selfID, bySkill: true });
}

// === 格林射线 · 移转（纯函数） ===
// 弃 1 梦境穿梭剂 + 1 SHOOT → 移到任意层 + 执行 SHOOT 效果
export const GREEN_RAY_SKILL_ID = 'thief_green_ray.skill_0';
