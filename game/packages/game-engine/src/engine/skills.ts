// 角色技能运行时执行器
// MVP 4 角色：先锋（突袭）/ 译梦师（伏笔）/ 要塞（冷酷）/ 棋局（易位）
// 对照：docs/manual/05-dream-thieves.md / 06-dream-master.md

import type { SetupState, PlayerSetup } from '../setup.js';
import { drawCards, movePlayerToLayer, incrementMoveCounter } from '../moves.js';
import { resolveShootCustom } from '../dice.js';
import { flipCharacter } from './abilities/dual-faced.js';
import type { CardID, Layer } from '@icgame/shared';

// === 技能使用前检查 ===

/** 检查技能本回合是否可用（含 limitN） */
export function canUseSkill(
  player: PlayerSetup,
  skillId: string,
  usageScope: string,
  limitN?: number,
): boolean {
  if (usageScope === 'unlimited') return true;

  const usedThisTurn = player.skillUsedThisTurn[skillId] ?? 0;
  if (usageScope === 'ownTurnOncePerTurn' && usedThisTurn >= 1) return false;
  if (usageScope === 'ownTurnLimitN' && limitN !== undefined && usedThisTurn >= limitN)
    return false;

  const usedThisGame = player.skillUsedThisGame[skillId] ?? 0;
  if (usageScope === 'perGameLimitN' && limitN !== undefined && usedThisGame >= limitN)
    return false;

  return true;
}

/** 标记技能已使用 */
export function markSkillUsed(state: SetupState, playerID: string, skillId: string): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: {
        ...player,
        skillUsedThisTurn: {
          ...player.skillUsedThisTurn,
          [skillId]: (player.skillUsedThisTurn[skillId] ?? 0) + 1,
        },
        skillUsedThisGame: {
          ...player.skillUsedThisGame,
          [skillId]: (player.skillUsedThisGame[skillId] ?? 0) + 1,
        },
      },
    },
  };
}

// === 先锋 · 突袭 ===
// 对照：docs/manual/05-dream-thieves.md 先锋
// 抽牌阶段抽取的牌中含【梦境穿梭剂】则再从牌库顶抽 2 张

export const POINTMAN_SKILL_ID = 'thief_pointman.skill_0';

/** 先锋技能：检查抽到的牌是否含梦境穿梭剂 */
export function pointmanCheckDrawnCards(drawnCards: CardID[]): boolean {
  return drawnCards.some((c) => c === 'action_dream_transit');
}

/** 先锋技能：抽牌后触发，含穿梭剂则额外抽 2 张 */
export function applyPointmanAssault(
  state: SetupState,
  playerID: string,
  drawnCards: CardID[],
): SetupState {
  const player = state.players[playerID];
  if (!player || player.characterId !== 'thief_pointman') return state;
  if (!canUseSkill(player, POINTMAN_SKILL_ID, 'ownTurnOncePerTurn')) return state;

  if (!pointmanCheckDrawnCards(drawnCards)) return state;

  let s = markSkillUsed(state, playerID, POINTMAN_SKILL_ID);
  s = drawCards(s, playerID, 2);
  return s;
}

// === 穿行者 · 支助 ===
// 对照：docs/manual/05-dream-thieves.md 穿行者
// 出牌阶段：可将所有手牌（最少 1 张）给另一位玩家，然后移动到该玩家所在层
// 限制：本回合 1 次

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
  if (!canUseSkill(self, TOURIST_SKILL_ID, 'ownTurnOncePerTurn')) return false;
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

  let s = markSkillUsed(state, selfID, TOURIST_SKILL_ID);
  // 转移手牌
  s = {
    ...s,
    players: {
      ...s.players,
      [selfID]: { ...s.players[selfID]!, hand: [] },
      [targetID]: {
        ...s.players[targetID]!,
        hand: [...s.players[targetID]!.hand, ...self.hand],
      },
    },
  };
  // 自己移动到 target 层
  s = movePlayerToLayer(s, selfID, target.currentLayer);
  return incrementMoveCounter(s);
}

// === 狮子 · 王道 ===
// 对照：docs/manual/05-dream-thieves.md 狮子
// 抽牌阶段：从牌库顶额外抽 = 梦主手牌数；梦主无手牌则从弃牌堆中额外选取 1 张
// 限制：本回合 1 次
//
// MVP 简化：弃牌堆挑选自动取顶 1 张（不进入 pending 中间态）

export const LEO_SKILL_ID = 'thief_leo.skill_0';

/** 狮子技能：抽牌后触发 */
export function applyLeoKingdom(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player || player.characterId !== 'thief_leo') return state;
  if (!canUseSkill(player, LEO_SKILL_ID, 'ownTurnOncePerTurn')) return state;

  const masterID = state.dreamMasterID;
  const master = state.players[masterID];
  if (!master) return state;

  let s = markSkillUsed(state, playerID, LEO_SKILL_ID);
  const masterHandCount = master.hand.length;

  if (masterHandCount > 0) {
    // 从牌库顶额外抽 = 梦主手牌数
    s = drawCards(s, playerID, masterHandCount);
  } else if (s.deck.discardPile.length > 0) {
    // 梦主无手牌：从弃牌堆顶取 1 张（MVP 简化）
    const discardTop = s.deck.discardPile[s.deck.discardPile.length - 1]!;
    const newDiscard = s.deck.discardPile.slice(0, -1);
    const self = s.players[playerID]!;
    s = {
      ...s,
      deck: { ...s.deck, discardPile: newDiscard },
      players: {
        ...s.players,
        [playerID]: { ...self, hand: [...self.hand, discardTop] },
      },
    };
  }
  // 弃牌堆也无 → 无效果，但技能算已使用
  return s;
}

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

// ============================================================================
// W12 中复杂度角色（7 个）
// ============================================================================
// Tier A（弃牌取牌类）：药剂师 / 战争之王 / 灵魂牧师 → 完整 skills + move 接入
// Tier B（SHOOT 修饰类）：意念判官 / 天蝎 / 金牛 → skills 纯函数（move 接入待批次）
// Tier C（多阶段交互）：天秤 → skills 纯函数（pending 状态机待批次）

// === 药剂师 · 调剂 ===
// 对照：docs/manual/05-dream-thieves.md 药剂师
// 出牌阶段：弃 1 张手牌 → 弃牌堆中拿 1 张【梦境穿梭剂】到手牌。回合限 2 次。

export const CHEMIST_SKILL_ID = 'thief_chemist.skill_0';
const CHEMIST_LIMIT_PER_TURN = 2;

/** 药剂师技能 */
export function applyChemistRefine(
  state: SetupState,
  selfID: string,
  discardCardId: CardID,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_chemist') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, CHEMIST_SKILL_ID, 'ownTurnLimitN', CHEMIST_LIMIT_PER_TURN)) return null;

  // 弃牌必须在手中
  const handIdx = player.hand.indexOf(discardCardId);
  if (handIdx === -1) return null;

  // 弃牌堆必须含 action_dream_transit
  const transitIdx = state.deck.discardPile.lastIndexOf('action_dream_transit' as CardID);
  if (transitIdx === -1) return null;

  let s = markSkillUsed(state, selfID, CHEMIST_SKILL_ID);
  // 移除手牌 + 加入弃牌堆
  const newHand = [...player.hand];
  newHand.splice(handIdx, 1);
  // 取出梦境穿梭剂
  const newDiscard = [...s.deck.discardPile];
  newDiscard.splice(transitIdx, 1);
  // 加入手牌
  newHand.push('action_dream_transit' as CardID);
  s = {
    ...s,
    players: { ...s.players, [selfID]: { ...s.players[selfID]!, hand: newHand } },
    deck: { ...s.deck, discardPile: [...newDiscard, discardCardId] },
  };
  return s;
}

// === 战争之王 · 黑市 ===
// 对照：docs/manual/05-dream-thieves.md 战争之王
// 出牌阶段：弃 2 张手牌 → 弃牌堆任意 1 张到手牌。回合限 1 次。

export const LORD_OF_WAR_SKILL_ID = 'thief_lord_of_war.skill_0';

/** 战争之王技能 */
export function applyLordOfWarBlackMarket(
  state: SetupState,
  selfID: string,
  discardIds: readonly CardID[],
  pickFromDiscard: CardID,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_lord_of_war') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, LORD_OF_WAR_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  if (discardIds.length !== 2) return null;

  // 两张弃牌必须都在手中（允许重复，但需要两个独立 index）
  const newHand = [...player.hand];
  for (const cid of discardIds) {
    const idx = newHand.indexOf(cid);
    if (idx === -1) return null;
    newHand.splice(idx, 1);
  }

  // 弃牌堆必须含 pickFromDiscard
  const pickIdx = state.deck.discardPile.lastIndexOf(pickFromDiscard);
  if (pickIdx === -1) return null;

  let s = markSkillUsed(state, selfID, LORD_OF_WAR_SKILL_ID);
  const newDiscard = [...s.deck.discardPile];
  newDiscard.splice(pickIdx, 1);
  newHand.push(pickFromDiscard);
  s = {
    ...s,
    players: { ...s.players, [selfID]: { ...s.players[selfID]!, hand: newHand } },
    deck: { ...s.deck, discardPile: [...newDiscard, ...discardIds] },
  };
  return s;
}

// === 灵魂牧师 · 拯救 ===
// 对照：docs/manual/05-dream-thieves.md 灵魂牧师
// 出牌阶段：弃 1 手牌 → 复活迷失层（layer 0）一名玩家到自己所在层 + 取该玩家所有手牌。回合限 2 次。

export const PAPRIK_SKILL_ID = 'thief_paprik.skill_0';
const PAPRIK_LIMIT_PER_TURN = 2;

/** 灵魂牧师技能 */
export function applyPaprikSalvation(
  state: SetupState,
  selfID: string,
  discardCardId: CardID,
  targetID: string,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_paprik') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, PAPRIK_SKILL_ID, 'ownTurnLimitN', PAPRIK_LIMIT_PER_TURN)) return null;

  const target = state.players[targetID];
  if (!target) return null;
  // target 必须是死亡玩家（layer 0 / isAlive=false）
  if (target.isAlive) return null;
  if (selfID === targetID) return null;

  // 弃牌必须在手中
  const handIdx = player.hand.indexOf(discardCardId);
  if (handIdx === -1) return null;

  let s = markSkillUsed(state, selfID, PAPRIK_SKILL_ID);
  // 弃手牌
  const newHand = [...player.hand];
  newHand.splice(handIdx, 1);
  // 复活 target：isAlive=true、deathTurn=null、迁移到 self.currentLayer
  // target 的所有手牌转给 self（先收手牌，再清 target.hand）
  const targetHand = [...target.hand];
  s = {
    ...s,
    players: {
      ...s.players,
      [selfID]: { ...s.players[selfID]!, hand: [...newHand, ...targetHand] },
      [targetID]: {
        ...s.players[targetID]!,
        isAlive: true,
        deathTurn: null,
        hand: [],
      },
    },
    deck: { ...s.deck, discardPile: [...s.deck.discardPile, discardCardId] },
  };
  // 移动 target 到 self 所在层
  s = movePlayerToLayer(s, targetID, player.currentLayer);
  return s;
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

// === 天秤 · 平衡（手牌分组拣选）===
// 对照：docs/manual/05-dream-thieves.md 天秤
// 出牌阶段：将所有手牌给 target → target 分两份 → self 选 1 份取走，余下归还 target。回合限 1 次。
//
// engine 纯函数：拆分为 split + pick 两步（move 接入 + pendingLibra 状态机待后续批次）

export const LIBRA_SKILL_ID = 'thief_libra.skill_0';

export interface LibraSplitResult {
  pile1: CardID[];
  pile2: CardID[];
}

/** 天秤 step 1：target 分组（合法性校验） */
export function libraValidateSplit(
  totalHand: readonly CardID[],
  pile1: readonly CardID[],
  pile2: readonly CardID[],
): boolean {
  if (pile1.length + pile2.length !== totalHand.length) return false;
  // 两份合并后必须等于 totalHand 的多重集（multiset）
  const expected = [...totalHand].sort();
  const actual = [...pile1, ...pile2].sort();
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) return false;
  }
  return true;
}

/** 天秤 step 2：self 选哪份（返回 self 收到的牌 + target 留下的牌） */
export function libraResolvePick(
  split: LibraSplitResult,
  pick: 'pile1' | 'pile2',
): { selfGets: CardID[]; targetGets: CardID[] } {
  if (pick === 'pile1') {
    return { selfGets: [...split.pile1], targetGets: [...split.pile2] };
  }
  return { selfGets: [...split.pile2], targetGets: [...split.pile1] };
}

// === 译梦师 · 伏笔 ===
// 对照：docs/manual/05-dream-thieves.md 译梦师
// 使用【解封】时，从牌库顶抽 2 张牌

export const INTERPRETER_SKILL_ID = 'thief_dream_interpreter.skill_0';

/** 译梦师技能：解封成功后触发，抽 2 张 */
export function applyInterpreterForeshadow(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player || player.characterId !== 'thief_dream_interpreter') return state;
  if (!canUseSkill(player, INTERPRETER_SKILL_ID, 'ownTurnOncePerTurn')) return state;

  let s = markSkillUsed(state, playerID, INTERPRETER_SKILL_ID);
  s = drawCards(s, playerID, 2);
  return s;
}

// === 要塞 · 冷酷 ===
// 对照：plans/design/05-card-system.md 要塞 + docs/manual/06-dream-master.md
// 梦主出牌阶段移动到另一层时，可视为对任一盗梦者使用 1 张 SHOOT
// 世界观：梦主掷骰结果 -1

export const FORTRESS_SKILL_ID = 'dm_fortress.skill_0';

/** 要塞世界观：掷骰结果 -1 */
export function applyFortressDiceModifier(roll: number): number {
  return Math.max(1, roll - 1);
}

/** 要塞技能：梦主移动后触发，附加免费 SHOOT */
export function applyFortressColdness(
  state: SetupState,
  masterID: string,
  targetPlayerID: string,
  d6: () => number,
): SetupState {
  const master = state.players[masterID];
  const target = state.players[targetPlayerID];
  if (!master || !target) return state;
  if (master.characterId !== 'dm_fortress') return state;
  if (!canUseSkill(master, FORTRESS_SKILL_ID, 'ownTurnOncePerTurn')) return state;
  if (!target.isAlive) return state;
  if (target.faction !== 'thief') return state;

  let s = markSkillUsed(state, masterID, FORTRESS_SKILL_ID);

  // 免费掷骰（受世界观 -1 影响）
  const rawRoll = d6();
  const modifiedRoll = applyFortressDiceModifier(rawRoll);

  // SHOOT 基础：1 点 = 击杀
  if (modifiedRoll === 1) {
    // 击杀目标
    const handover = target.hand.slice(0, 2);
    s = {
      ...s,
      players: {
        ...s.players,
        [targetPlayerID]: {
          ...target,
          isAlive: false,
          deathTurn: s.turnNumber,
          hand: target.hand.slice(2),
        },
        [masterID]: {
          ...s.players[masterID]!,
          hand: [...s.players[masterID]!.hand, ...handover],
          shootCount: s.players[masterID]!.shootCount + 1,
        },
      },
    };
    s = movePlayerToLayer(s, targetPlayerID, 0);
  } else if (modifiedRoll >= 2 && modifiedRoll <= 5) {
    // 强制移动
    const currentLayer = target.currentLayer;
    const direction = currentLayer >= 4 ? -1 : 1;
    const newLayer = Math.max(1, Math.min(4, currentLayer + direction));
    s = movePlayerToLayer(s, targetPlayerID, newLayer as Layer);
  }
  // 6 = 躲过

  return incrementMoveCounter(s);
}

// === 棋局 · 易位 ===
// 对照：plans/design/05-card-system.md 棋局 + docs/manual/06-dream-master.md
// 金库被打开前，交换两个金库。限 2 次
// 世界观：使用梦境窥视时，从牌库顶抽 2 张

export const CHESS_SKILL_ID = 'dm_chess.skill_0';
const CHESS_MAX_USES = 2;

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

/** 棋局世界观：使用梦境窥视时抽 2 张 */
export function applyChessWorldViewPeek(state: SetupState, masterID: string): SetupState {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_chess') return state;
  // 世界观效果不走技能使用计数，是被动效果
  return drawCards(state, masterID, 2);
}

/** 检查棋局技能使用次数 */
export function getChessUsesLeft(player: PlayerSetup): number {
  const used = player.skillUsedThisGame[CHESS_SKILL_ID] ?? 0;
  return Math.max(0, CHESS_MAX_USES - used);
}

// ============================================================================
// W13 高复杂度角色（7 个 / 9 技能）
// ============================================================================
// Tier A 完整接入：阿波罗·崇拜 / 殉道者·牺牲 / 灵雕师·雕琢 / 雅典娜·惊叹 / 哈雷·冲击
// Tier B 纯函数：处女·完美 / 筑梦师·迷宫 / 雅典娜·急智（接入待 pending state 批次）
// 跳过：阿波罗·日冕（元能力，需 abilities registry 框架）

// === 阿波罗 · 崇拜 ===
// 出牌阶段：选择一位拥有贿赂牌的盗梦者，随机抽取该盗梦者的 1 张牌入手。回合限 1 次。
export const APOLLO_WORSHIP_SKILL_ID = 'thief_apollo.skill_0';

/** 阿波罗崇拜：从指定 target 随机抽 1 张手牌 */
export function applyApolloWorship(
  state: SetupState,
  selfID: string,
  targetID: string,
  pickIndex: number, // 由调用方提供随机索引（注入 D6 随机性）
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_apollo') return null;
  if (!player.isAlive) return null;
  if (selfID === targetID) return null;
  if (!canUseSkill(player, APOLLO_WORSHIP_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  const target = state.players[targetID];
  if (!target || !target.isAlive) return null;
  // target 必须是盗梦者且拥有贿赂牌（bribeReceived > 0）
  if (target.faction !== 'thief') return null;
  if (target.bribeReceived <= 0) return null;
  if (target.hand.length === 0) return null;

  const safeIdx = ((pickIndex % target.hand.length) + target.hand.length) % target.hand.length;
  const picked = target.hand[safeIdx]!;

  let s = markSkillUsed(state, selfID, APOLLO_WORSHIP_SKILL_ID);
  const newTargetHand = [...target.hand];
  newTargetHand.splice(safeIdx, 1);
  s = {
    ...s,
    players: {
      ...s.players,
      [selfID]: { ...s.players[selfID]!, hand: [...s.players[selfID]!.hand, picked] },
      [targetID]: { ...s.players[targetID]!, hand: newTargetHand },
    },
  };
  return s;
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

  let s = markSkillUsed(state, selfID, MARTYR_SKILL_ID);

  // 自杀 + 弃手牌（无论骰值）
  const handToDiscard = [...player.hand];
  s = {
    ...s,
    players: {
      ...s.players,
      [selfID]: {
        ...s.players[selfID]!,
        isAlive: false,
        deathTurn: s.turnNumber,
        hand: [],
        currentLayer: 0,
      },
    },
    deck: { ...s.deck, discardPile: [...s.deck.discardPile, ...handToDiscard] },
    layers: {
      ...s.layers,
      [player.currentLayer]: {
        ...layer,
        playersInLayer: layer.playersInLayer.filter((id) => id !== selfID),
      },
      0: s.layers[0]
        ? { ...s.layers[0]!, playersInLayer: [...s.layers[0]!.playersInLayer, selfID] }
        : {
            layer: 0,
            dreamCardId: null,
            nightmareId: null,
            nightmareRevealed: false,
            nightmareTriggered: false,
            playersInLayer: [selfID],
            heartLockValue: 0,
          },
    },
  };

  let heartLockChanged = false;
  if (roll >= 3 && roll <= 6) {
    const cur = layer.heartLockValue;
    const delta = direction === 'increase' ? 2 : -2;
    let next = cur + delta;
    next = Math.max(0, Math.min(originalHeartLockCap, next));
    if (next !== cur) {
      heartLockChanged = true;
      s = {
        ...s,
        layers: {
          ...s.layers,
          [player.currentLayer]: { ...s.layers[player.currentLayer]!, heartLockValue: next },
        },
      };
    }
  }

  return { state: s, rolled: roll, heartLockChanged };
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

  let s = markSkillUsed(state, selfID, ATHENA_AWE_SKILL_ID);

  // 5 张牌名是否全不同
  const all5 = [...shownHandIds, deckTop];
  const success = checkAthenaAweCondition(all5);

  if (!success) {
    // 失败：仍消耗技能 + 牌库顶不动（仅展示）
    return s;
  }

  // 成功：击杀 target，取其全部手牌
  const targetHand = [...target.hand];
  s = {
    ...s,
    players: {
      ...s.players,
      [selfID]: {
        ...s.players[selfID]!,
        hand: [...s.players[selfID]!.hand, ...targetHand],
        shootCount: s.players[selfID]!.shootCount + 1,
      },
      [targetID]: {
        ...s.players[targetID]!,
        isAlive: false,
        deathTurn: s.turnNumber,
        hand: [],
        currentLayer: 0,
      },
    },
    layers: {
      ...s.layers,
      [player.currentLayer]: {
        ...s.layers[player.currentLayer]!,
        playersInLayer: s.layers[player.currentLayer]!.playersInLayer.filter(
          (id) => id !== targetID,
        ),
      },
      0: s.layers[0]
        ? { ...s.layers[0]!, playersInLayer: [...s.layers[0]!.playersInLayer, targetID] }
        : {
            layer: 0,
            dreamCardId: null,
            nightmareId: null,
            nightmareRevealed: false,
            nightmareTriggered: false,
            playersInLayer: [targetID],
            heartLockValue: 0,
          },
    },
  };
  return s;
}

// ============================================================================
// W13 Tier B 纯函数（接入待 pending state 批次）
// ============================================================================

// === 处女 · 完美 ===
// 当任意玩家掷出 6 时可触发：复活一位玩家 / 抽 2 张 / 移到任意层
export const VIRGO_SKILL_ID = 'thief_virgo.skill_0';

export type VirgoPerfectChoice = 'revive' | 'draw_two' | 'teleport';

/** 处女完美触发条件：任意玩家骰 6 */
export function isVirgoPerfectTriggered(rawRoll: number): boolean {
  return rawRoll === 6;
}

// === 筑梦师 · 迷宫 ===
// 弃 1 SHOOT 类牌；同层 1 玩家在其下回合结束前不受行动牌+技能影响、不能移动
export const ARCHITECT_SKILL_ID = 'thief_architect.skill_0';

/** 是否 SHOOT 类牌（迷宫弃牌门禁） */
export function isShootClassCard(cardId: CardID): boolean {
  return (
    cardId === 'action_shoot' ||
    cardId === 'action_shoot_king' ||
    cardId === 'action_shoot_armor' ||
    cardId === 'action_shoot_burst' ||
    cardId === 'action_shoot_dream_transit'
  );
}

// 迷宫允许的行动牌（对照：docs/manual/05-dream-thieves.md 筑梦师）
const MAZE_ALLOWED_MOVES = new Set([
  'playShoot',
  'playShootKing',
  'playShootArmor',
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

// === 雅典娜 · 急智 ===
// 同层盗梦者对你用行动牌时，可先抽弃牌堆 1 张。回合限 1 次（每个对手回合）
export const ATHENA_WIT_SKILL_ID = 'thief_athena.skill_0';

/** 雅典娜·急智：从弃牌堆顶抽 1 张到 selfID 手牌（纯函数） */
export function applyAthenaWit(state: SetupState, selfID: string): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_athena') return null;
  if (!player.isAlive) return null;
  if (state.deck.discardPile.length === 0) return null;

  const top = state.deck.discardPile[state.deck.discardPile.length - 1]!;
  const newDiscard = state.deck.discardPile.slice(0, -1);
  return {
    ...state,
    players: { ...state.players, [selfID]: { ...player, hand: [...player.hand, top] } },
    deck: { ...state.deck, discardPile: newDiscard },
  };
}

// ============================================================================
// W14 混合 9 角色
// ============================================================================
// 完整接入：影子 / 降世神通 / 梦境猎手 / 欺诈师 / 恐怖分子（SHOOT 跨层被动）
// 纯函数：小丑 / 黑洞 / 黑天鹅 / 空间女王（接入待 pending state / 响应窗口）

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

// === 梦境猎手 · 满载 ===
// 成功解封后抽 = 当层现有心锁数（解封后心锁数）
export const EXTRACTOR_SKILL_ID = 'thief_extractor.skill_0';

export function applyExtractorBounty(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player || player.characterId !== 'thief_extractor') return state;
  if (!player.isAlive) return state;
  const layerInfo = state.layers[player.currentLayer];
  if (!layerInfo) return state;
  const drawN = layerInfo.heartLockValue;
  if (drawN <= 0) return state;
  return drawCards(state, playerID, drawN);
}

// === 欺诈师 · 盗心（两阶段：抽 + 还）===
// MVP 简化为一步 move：传入要抽的数量 N，自动随机选 N 张（用 D6 注入）
// 然后立即从 self 还 N 张（玩家选）。简化为：抽 N 张 + 立即还 N 张同时进行。
// 真实规则需"看到 target 手牌然后选择"，MVP 用：随机抽 N + self 选 N 张还
export const FORGER_SKILL_ID = 'thief_forger.skill_0';

export interface ForgerExchange {
  targetID: string;
  /** 从 target 抽走的牌（随机或指定 idx） */
  takenFromTarget: CardID[];
  /** 还给 target 的同等数量手牌 */
  returnedToTarget: CardID[];
}

export function applyForgerExchange(
  state: SetupState,
  selfID: string,
  ex: ForgerExchange,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_forger') return null;
  if (!player.isAlive) return null;
  if (selfID === ex.targetID) return null;
  if (!canUseSkill(player, FORGER_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  const target = state.players[ex.targetID];
  if (!target || !target.isAlive) return null;
  // 抽走数量 1-2
  const N = ex.takenFromTarget.length;
  if (N < 1 || N > 2) return null;
  if (ex.returnedToTarget.length !== N) return null;
  // 检查可行性：takenFromTarget 必须都在 target 手中（multiset）
  const targetHandCopy = [...target.hand];
  for (const cid of ex.takenFromTarget) {
    const idx = targetHandCopy.indexOf(cid);
    if (idx === -1) return null;
    targetHandCopy.splice(idx, 1);
  }
  // returnedToTarget 必须在 self 当前手中（含将获取的；这里 self 还在原手牌阶段，所以仅检查原手牌）
  const selfHandCopy = [...player.hand];
  for (const cid of ex.returnedToTarget) {
    const idx = selfHandCopy.indexOf(cid);
    if (idx === -1) return null;
    selfHandCopy.splice(idx, 1);
  }

  const s = markSkillUsed(state, selfID, FORGER_SKILL_ID);
  // self 手牌：去掉 returnedToTarget + 加入 takenFromTarget
  const newSelfHand = [...selfHandCopy, ...ex.takenFromTarget];
  // target 手牌：去掉 takenFromTarget + 加入 returnedToTarget
  const newTargetHand = [...targetHandCopy, ...ex.returnedToTarget];
  return {
    ...s,
    players: {
      ...s.players,
      [selfID]: { ...s.players[selfID]!, hand: newSelfHand },
      [ex.targetID]: { ...s.players[ex.targetID]!, hand: newTargetHand },
    },
  };
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

// === 小丑 · 赌博（纯函数） ===
// 略过抽牌阶段时可掷骰 → 抽 = 骰值；下回合 discard 必须全弃
export const JOKER_SKILL_ID = 'thief_joker.skill_0';

export function jokerDrawCount(roll: number): number {
  return Math.max(1, Math.min(6, roll));
}

// === 黑洞 · 征收（抽牌阶段所有同层玩家给 1 张）（纯函数） ===
export const BLACK_HOLE_LEVY_SKILL_ID = 'thief_black_hole.skill_0';

export function applyBlackHoleLevy(
  state: SetupState,
  selfID: string,
  giverPicks: Record<string, CardID>, // each player's chosen card to give
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_black_hole') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, BLACK_HOLE_LEVY_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  const layerInfo = state.layers[player.currentLayer];
  if (!layerInfo) return null;
  const otherPlayers = layerInfo.playersInLayer.filter((id) => id !== selfID);
  if (otherPlayers.length === 0) return null;
  // 校验所有 giverPicks 都来自同层玩家
  for (const giverId of otherPlayers) {
    const card = giverPicks[giverId];
    if (!card) return null;
    const giver = state.players[giverId];
    if (!giver || !giver.isAlive) return null;
    if (!giver.hand.includes(card)) return null;
  }

  const s = markSkillUsed(state, selfID, BLACK_HOLE_LEVY_SKILL_ID);
  const newPlayers = { ...s.players };
  const totalCollected: CardID[] = [];
  for (const giverId of otherPlayers) {
    const card = giverPicks[giverId]!;
    const giver = newPlayers[giverId]!;
    const idx = giver.hand.indexOf(card);
    const newHand = [...giver.hand];
    newHand.splice(idx, 1);
    newPlayers[giverId] = { ...giver, hand: newHand };
    totalCollected.push(card);
  }
  newPlayers[selfID] = {
    ...newPlayers[selfID]!,
    hand: [...newPlayers[selfID]!.hand, ...totalCollected],
  };
  return { ...s, players: newPlayers };
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

// === 黑天鹅 · 巡演（纯函数） ===
// 略过抽牌阶段，分发所有手牌（≥1）给任意盗梦者，抽 4 张
export const BLACK_SWAN_SKILL_ID = 'thief_black_swan.skill_0';

export function applyBlackSwanTour(
  state: SetupState,
  selfID: string,
  distribution: Record<string, CardID[]>,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_black_swan') return null;
  if (!player.isAlive) return null;
  if (player.hand.length === 0) return null;
  if (!canUseSkill(player, BLACK_SWAN_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  // 分发总数 = 手牌总数（必须全分）
  const totalDistributed = Object.values(distribution).reduce((sum, cs) => sum + cs.length, 0);
  if (totalDistributed !== player.hand.length) return null;
  // 分发的牌必须都在 self 手中（multiset）
  const handCopy = [...player.hand];
  for (const cards of Object.values(distribution)) {
    for (const cid of cards) {
      const idx = handCopy.indexOf(cid);
      if (idx === -1) return null;
      handCopy.splice(idx, 1);
    }
  }
  // 不能分给自己；接收者必须是活着的盗梦者
  for (const recvId of Object.keys(distribution)) {
    if (recvId === selfID) return null;
    const recv = state.players[recvId];
    if (!recv || !recv.isAlive || recv.faction !== 'thief') return null;
  }

  let s = markSkillUsed(state, selfID, BLACK_SWAN_SKILL_ID);
  const newPlayers = { ...s.players, [selfID]: { ...s.players[selfID]!, hand: [] } };
  for (const [recvId, cards] of Object.entries(distribution)) {
    newPlayers[recvId] = {
      ...newPlayers[recvId]!,
      hand: [...newPlayers[recvId]!.hand, ...cards],
    };
  }
  s = { ...s, players: newPlayers };
  // 抽 4 张
  s = drawCards(s, selfID, 4);
  return s;
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

// ============================================================================
// W15 双面 / 扩展 9 角色
// ============================================================================
// 完整接入：双子 / 双鱼 / 露娜（含翻面）/ 盖亚 / 达尔文
// 纯函数：白羊 / 射手 / 水瓶 / 格林射线（接入待响应窗口/扩展批次）

// === 双子 · 协同 ===
// 弃牌阶段：梦主层数 > self 层数时，可掷骰 → 3 → 当层 -2 心锁 → 翻面
export const GEMINI_SKILL_ID = 'thief_gemini.skill_0';

export function applyGeminiSync(
  state: SetupState,
  selfID: string,
  roll: number,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_gemini') return null;
  if (!player.isAlive) return null;
  if (player.currentLayer < 1) return null;
  const master = state.players[state.dreamMasterID];
  if (!master) return null;
  if (master.currentLayer <= player.currentLayer) return null;
  if (!canUseSkill(player, GEMINI_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  let s = markSkillUsed(state, selfID, GEMINI_SKILL_ID);
  if (roll === 3) {
    const layerInfo = s.layers[player.currentLayer]!;
    const nextHL = Math.max(0, layerInfo.heartLockValue - 2);
    s = {
      ...s,
      layers: { ...s.layers, [player.currentLayer]: { ...layerInfo, heartLockValue: nextHL } },
    };
  }
  // 翻面（无论骰值）
  s = flipCharacter(s, selfID);
  return s;
}

// === 双鱼 · 闪避 ===
// 成为 SHOOT 目标时，可移到数字更小相邻层忽略 SHOOT 效果 → 翻面
// 接入：在 applyShootVariant 前置 hook 检查（被动）
export const PISCES_SKILL_ID = 'thief_pisces.skill_0';

/** 双鱼是否可发动（是 thief_pisces 且未翻面 + 当前层 > 1） */
export function canPiscesEvade(player: PlayerSetup): boolean {
  if (player.characterId !== 'thief_pisces') return false;
  if (!player.isAlive) return false;
  if (player.currentLayer <= 1) return false;
  if (!canUseSkill(player, PISCES_SKILL_ID, 'ownTurnOncePerTurn')) return false;
  return true;
}

/** 执行双鱼闪避：移到 currentLayer-1 + 翻面 */
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
  if (!player || player.characterId !== 'thief_luna') return null;
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
  s = {
    ...s,
    players: { ...s.players, [selfID]: { ...s.players[selfID]!, hand: handCopy } },
    deck: { ...s.deck, discardPile: [...s.deck.discardPile, ...shootCardIds] },
  };
  // 击杀 target
  const targetHand = [...target.hand];
  s = {
    ...s,
    players: {
      ...s.players,
      [selfID]: {
        ...s.players[selfID]!,
        hand: [...s.players[selfID]!.hand, ...targetHand.slice(0, 2)],
        shootCount: s.players[selfID]!.shootCount + 1,
      },
      [targetID]: {
        ...s.players[targetID]!,
        isAlive: false,
        deathTurn: s.turnNumber,
        hand: targetHand.slice(2),
      },
    },
  };
  s = movePlayerToLayer(s, targetID, 0);
  // 翻面
  s = flipCharacter(s, selfID);
  return s;
}

// === 盖亚 · 大地 ===
// 出牌阶段：令同层其余玩家移到 ±1 层（不入迷失层）。回合限 2 次
export const GAIA_SKILL_ID = 'thief_gaia.skill_0';
const GAIA_LIMIT_PER_TURN = 2;

export function applyGaiaShift(
  state: SetupState,
  selfID: string,
  picks: Record<string, -1 | 1>, // 每玩家方向
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_gaia') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, GAIA_SKILL_ID, 'ownTurnLimitN', GAIA_LIMIT_PER_TURN)) return null;
  const layerInfo = state.layers[player.currentLayer];
  if (!layerInfo) return null;
  const others = layerInfo.playersInLayer.filter((id) => id !== selfID);
  // picks 必须仅含同层其他玩家
  for (const id of Object.keys(picks)) {
    if (!others.includes(id)) return null;
    const dir = picks[id];
    if (dir !== -1 && dir !== 1) return null;
    const next = player.currentLayer + dir;
    if (next < 1 || next > 4) return null; // 不入迷失层（0）也不超 4
  }

  let s = markSkillUsed(state, selfID, GAIA_SKILL_ID);
  for (const [pid, dir] of Object.entries(picks)) {
    const next = (player.currentLayer + dir) as Layer;
    s = movePlayerToLayer(s, pid, next);
  }
  return s;
}

// === 达尔文 · 进化 ===
// 出牌阶段：抽牌库顶 2 张 → 任意 2 张手牌按任意顺序放回牌库顶。每回合 1 次
// MVP：一步式 — 输入 returnCards（要放回顶的 2 张，第一张为最顶）
export const DARWIN_SKILL_ID = 'thief_darwin.skill_0';

export function applyDarwinEvolution(
  state: SetupState,
  selfID: string,
  returnCards: readonly CardID[],
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_darwin') return null;
  if (!player.isAlive) return null;
  if (state.deck.cards.length < 2) return null;
  if (returnCards.length !== 2) return null;
  if (!canUseSkill(player, DARWIN_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  // 抽牌库顶 2 张
  const drawn = state.deck.cards.slice(0, 2);
  const remainingDeck = state.deck.cards.slice(2);
  const tempHand = [...player.hand, ...drawn];
  // 校验 returnCards 都在 tempHand
  const handCopy = [...tempHand];
  for (const cid of returnCards) {
    const idx = handCopy.indexOf(cid);
    if (idx === -1) return null;
    handCopy.splice(idx, 1);
  }

  const s = markSkillUsed(state, selfID, DARWIN_SKILL_ID);
  return {
    ...s,
    players: { ...s.players, [selfID]: { ...s.players[selfID]!, hand: handCopy } },
    deck: { ...s.deck, cards: [...returnCards, ...remainingDeck] },
  };
}

// ============================================================================
// W15 纯函数（接入待响应窗口 / 扩展批次）
// ============================================================================

// === 白羊 · 解封者（纯函数） ===
// 1: 盗梦者被杀时翻当层梦魇（响应触发）
// 2: 弃掉的梦魇牌每张让 self 抽牌阶段 +1
export const ARIES_REVEAL_SKILL_ID = 'thief_aries.skill_0';
export const ARIES_DRAW_SKILL_ID = 'thief_aries.skill_1';

/** 白羊·已弃梦魇加成抽 N（N = 已弃梦魇数） */
export function ariesExtraDrawCount(state: SetupState): number {
  return state.usedNightmareIds.length;
}

// === 射手 · 神射（纯函数） ===
// 1: SHOOT 目标移动时可不让其移动（响应）
// 2: 击杀 1 玩家后改 1 心锁（限 1 次）
export const SAGITTARIUS_NO_MOVE_SKILL_ID = 'thief_sagittarius.skill_0';
export const SAGITTARIUS_HEART_LOCK_SKILL_ID = 'thief_sagittarius.skill_1';

/** 射手心锁修改：±1，受 cap 限制 */
export function applySagittariusHeartLock(
  state: SetupState,
  layer: number,
  delta: -1 | 1,
  cap: number,
): SetupState | null {
  const layerInfo = state.layers[layer];
  if (!layerInfo) return null;
  const next = Math.max(0, Math.min(cap, layerInfo.heartLockValue + delta));
  if (next === layerInfo.heartLockValue) return state;
  return {
    ...state,
    layers: { ...state.layers, [layer]: { ...layerInfo, heartLockValue: next } },
  };
}

// === 水瓶 · 同流（纯函数） ===
// 1: 每用过 2 张同名 → 弃牌堆取 1 张未用过的牌
// 2: 解封次数无限制（被动）
export const AQUARIUS_REUSE_SKILL_ID = 'thief_aquarius.skill_0';
export const AQUARIUS_UNLOCK_SKILL_ID = 'thief_aquarius.skill_1';

/** 水瓶·解封无限被动判定（与摩羯类似） */
export function isAquariusUnlimitedActive(player: PlayerSetup): boolean {
  if (player.characterId !== 'thief_aquarius') return false;
  if (!player.isAlive) return false;
  return true;
}

// === 格林射线 · 移转（纯函数） ===
// 弃 1 梦境穿梭剂 + 1 SHOOT → 移到任意层 + 执行 SHOOT 效果
export const GREEN_RAY_SKILL_ID = 'thief_green_ray.skill_0';

/** 格林射线弃牌组合判定 */
export function canGreenRayActivate(player: PlayerSetup): boolean {
  if (player.characterId !== 'thief_green_ray') return false;
  if (!player.isAlive) return false;
  const hasTransit = player.hand.some((c) => c === 'action_dream_transit');
  const hasShoot = player.hand.some(
    (c) =>
      c === 'action_shoot' ||
      c === 'action_shoot_king' ||
      c === 'action_shoot_armor' ||
      c === 'action_shoot_burst' ||
      c === 'action_shoot_dream_transit',
  );
  return hasTransit && hasShoot;
}

// ============================================================================
// W16-A 梦主 6 角色（纯函数 + 简单接入）
// ============================================================================
// 港口 / 盛夏 / 黑洞·DM / 海王星·泓洋 / 木星·巅峰 / 土星·领地
// 对照：plans/design/05-card-system.md + docs/manual/06-dream-master.md

/** 找当前梦主玩家 ID（faction === 'master'，alive 优先） */
export function findMasterID(state: SetupState): string | null {
  for (const pid of state.playerOrder) {
    const p = state.players[pid];
    if (p?.faction === 'master') return pid;
  }
  return null;
}

/** 找当前梦主角色 ID */
export function getMasterCharacterID(state: SetupState): CardID | null {
  const mid = findMasterID(state);
  if (!mid) return null;
  return state.players[mid]?.characterId ?? null;
}

// === 港口 · 海啸 + 世界观 ===
// 技能 海啸：当任一金库被打开，游戏未结束时，所有盗梦者各掷 1 颗骰子
//   1-5 → 该盗梦者死亡（直接迷失层，跳过击杀状态，不给手牌）
//   6   → 躲过
// 世界观 港口：当 2 个金库被打开仍未找到秘密，则梦主胜
// 对照：cards-data.json dm_harbor

export const HARBOR_TSUNAMI_SKILL_ID = 'dm_harbor.skill_0';

/** 港口·海啸：金库打开后触发；rolls 顺序对应 alive thieves 的 playerOrder 排序 */
export function applyHarborTsunami(state: SetupState, rolls: number[]): SetupState {
  const mid = findMasterID(state);
  if (!mid) return state;
  const master = state.players[mid];
  if (!master || master.characterId !== 'dm_harbor') return state;

  // 收集存活盗梦者（按 playerOrder 排序）
  const aliveThieves = state.playerOrder.filter((pid) => {
    const p = state.players[pid];
    return p && p.faction === 'thief' && p.isAlive;
  });
  if (aliveThieves.length === 0) return state;

  let s = state;
  for (let i = 0; i < aliveThieves.length; i++) {
    const pid = aliveThieves[i]!;
    const roll = rolls[i] ?? 6;
    if (roll >= 1 && roll <= 5) {
      // 死亡 → 直接迷失层；不交手牌（跳过击杀状态）
      const target = s.players[pid];
      if (!target || !target.isAlive) continue;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...target,
            isAlive: false,
            deathTurn: s.turnNumber,
          },
        },
      };
      s = movePlayerToLayer(s, pid, 0);
    }
  }
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
// 对照：cards-data.json dm_midsummer

/** 盛夏·充盈：梦主额外抽牌数（=未派发贿赂池剩余张数） */
export function getMidsummerExtraDraws(state: SetupState): number {
  if (getMasterCharacterID(state) !== 'dm_midsummer') return 0;
  return state.bribePool?.length ?? 0;
}

/** 盛夏世界观：盗梦者抽牌额外 +N（默认 +1） */
export function getMidsummerWorldThiefBonus(state: SetupState): number {
  return getMasterCharacterID(state) === 'dm_midsummer' ? 1 : 0;
}

// === 黑洞 (梦主版) · 倒流 + 世界观 ===
// 技能 倒流：梦主每回合抽牌阶段，每未开金库的层 +2 心锁，不超过原始数
// 世界观 黑洞：盗梦者每回合可成功解封 2 次
// 对照：cards-data.json dm_black_hole

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
    s = {
      ...s,
      layers: {
        ...s.layers,
        [layerNum]: { ...layerInfo, heartLockValue: next },
      },
    };
  }
  return s;
}

/** 黑洞世界观：解封次数上限改为 2 */
export function isBlackHoleWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_black_hole';
}

/** 获取当前实际解封次数上限（黑洞世界观时为 2，否则用 G.maxUnlockPerTurn） */
export function getEffectiveMaxUnlockPerTurn(state: SetupState, base: number): number {
  return isBlackHoleWorldActive(state) ? Math.max(base, 2) : base;
}

// === 海王星·泓洋 · 风暴 + 世界观 ===
// 技能 风暴：每当心锁数减少时 / 时间风暴效果结算后 → 牌库顶弃 5 张
// 世界观 泓洋：当放着金币的金库被打开 → 梦主胜
// 对照：cards-data.json dm_neptune_ocean

export const NEPTUNE_STORM_SKILL_ID = 'dm_neptune_ocean.skill_0';
const NEPTUNE_STORM_DISCARD = 5;

/** 海王星·风暴：心锁减少 / 时间风暴后触发，弃 5 张 */
export function applyNeptuneStorm(state: SetupState): SetupState {
  if (getMasterCharacterID(state) !== 'dm_neptune_ocean') return state;
  const n = Math.min(NEPTUNE_STORM_DISCARD, state.deck.cards.length);
  if (n === 0) return state;
  const dropped = state.deck.cards.slice(0, n);
  return {
    ...state,
    deck: {
      ...state.deck,
      cards: state.deck.cards.slice(n),
      discardPile: [...state.deck.discardPile, ...dropped],
    },
  };
}

/** 海王星泓洋胜利判定：金币金库被打开 → 梦主胜 */
export function checkNeptuneWin(state: SetupState): boolean {
  if (getMasterCharacterID(state) !== 'dm_neptune_ocean') return false;
  return state.vaults.some((v) => v.isOpened && v.contentType === 'coin');
}

// === 木星·巅峰 · 雷霆 + 世界观 ===
// 技能 雷霆：梦主使用 SHOOT 类牌，目标掷骰 < 梦主所在层数 → 直接击杀
// 世界观 巅峰：SHOOT 类牌可对相邻层数玩家使用
// 对照：cards-data.json dm_jupiter_peak

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

// === 土星·领地 · 律令（纯函数） ===
// 技能 律令：弃 1 手牌抵消 1 张同名牌效果，并从牌库顶抽 1
// 世界观 领地：拥有贿赂的盗梦者，自己回合出牌阶段可不用行动牌移动 1 次到相邻层
// 集成留 W16-B（需 pending state + UI）；本批仅纯函数
// 对照：cards-data.json dm_saturn_territory

export const SATURN_DECREE_SKILL_ID = 'dm_saturn_territory.skill_0';

/** 律令：弃 1 张手牌（抵消同名后）+ 抽 1 */
export function applySaturnDecree(
  state: SetupState,
  masterID: string,
  discardCardId: CardID,
): SetupState | null {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_saturn_territory') return null;
  if (!master.isAlive) return null;
  const idx = master.hand.indexOf(discardCardId);
  if (idx === -1) return null;

  const newHand = [...master.hand];
  newHand.splice(idx, 1);

  let s: SetupState = {
    ...state,
    players: {
      ...state.players,
      [masterID]: { ...master, hand: newHand },
    },
    deck: {
      ...state.deck,
      discardPile: [...state.deck.discardPile, discardCardId],
    },
  };
  s = drawCards(s, masterID, 1);
  return s;
}

/** 土星领地世界观：盗梦者持有贿赂时获得 1 次免费移动（消耗后置 false） */
export function canSaturnFreeMove(state: SetupState, playerID: string): boolean {
  if (getMasterCharacterID(state) !== 'dm_saturn_territory') return false;
  const p = state.players[playerID];
  if (!p || p.faction !== 'thief' || !p.isAlive) return false;
  return p.bribeReceived > 0;
}

// ============================================================================
// W16-B 梦主主动技能（4 角色 · engine 接入）
// ============================================================================
// 皇城·重金 / 密道·传送 / 天王星·权力 / 冥王星·业火
// 对照：cards-data.json + docs/manual/06-dream-master.md

// === 皇城 · 重金 ===
// 派发贿赂时，可以选取 1 张给予该盗梦者（替代随机抽取）
// 对照：cards-data.json dm_imperial_city

export const IMPERIAL_BRIBE_SKILL_ID = 'dm_imperial_city.skill_0';

/** 皇城·重金：是否可以使用（梦主为皇城且目标合法） */
export function canImperialPickBribe(
  state: SetupState,
  masterID: string,
  targetID: string,
  poolIndex: number,
): boolean {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_imperial_city') return false;
  if (!master.isAlive) return false;
  const target = state.players[targetID];
  if (!target || !target.isAlive || target.faction !== 'thief') return false;
  const pool = state.bribePool;
  if (poolIndex < 0 || poolIndex >= pool.length) return false;
  return pool[poolIndex]!.status === 'inPool';
}

// === 密道 · 传送 ===
// 你的梦境穿梭剂可以将任一盗梦者移动至迷失层。回合限 2 次。
// 被送至迷失层的盗梦者不需要给予手牌（跳过击杀状态）
// 对照：cards-data.json dm_secret_passage

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
  if (!target || !target.isAlive || target.faction !== 'thief') return null;
  if (transitCardId !== 'action_dream_transit') return null;
  if (!master.hand.includes(transitCardId)) return null;
  if (
    !canUseSkill(master, SECRET_PASSAGE_SKILL_ID, 'ownTurnLimitN', SECRET_PASSAGE_MAX_USES_PER_TURN)
  )
    return null;

  // 弃掉穿梭剂
  const idx = master.hand.indexOf(transitCardId);
  const newHand = [...master.hand];
  newHand.splice(idx, 1);
  let s: SetupState = {
    ...state,
    players: {
      ...state.players,
      [masterID]: { ...master, hand: newHand },
    },
    deck: {
      ...state.deck,
      discardPile: [...state.deck.discardPile, transitCardId],
    },
  };
  s = markSkillUsed(s, masterID, SECRET_PASSAGE_SKILL_ID);
  // 直接送到迷失层（跳过击杀状态，保留手牌）
  s = movePlayerToLayer(s, targetID, 0);
  return s;
}

/** 检查密道·传送剩余次数 */
export function getSecretPassageUsesLeft(player: PlayerSetup): number {
  if (player.characterId !== 'dm_secret_passage') return 0;
  const used = player.skillUsedThisTurn[SECRET_PASSAGE_SKILL_ID] ?? 0;
  return Math.max(0, SECRET_PASSAGE_MAX_USES_PER_TURN - used);
}

// === 天王星·苍穹 · 权力 ===
// 出牌阶段，每拥有 1 张未派发贿赂 → 可令一位盗梦者移动到除迷失层外指定层数
// 必须移动到不同层；可重复对同一人
// 对照：cards-data.json dm_uranus_firmament

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
  if (!target || !target.isAlive || target.faction !== 'thief') return null;
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

/** 天王星·权力剩余次数 */
export function getUranusPowerUsesLeft(state: SetupState, player: PlayerSetup): number {
  if (player.characterId !== 'dm_uranus_firmament') return 0;
  const inPoolCount = state.bribePool.filter((b) => b.status === 'inPool').length;
  const usedThisTurn = player.skillUsedThisTurn[URANUS_POWER_SKILL_ID] ?? 0;
  return Math.max(0, inPoolCount - usedThisTurn);
}

// === 冥王星·地狱 · 业火 ===
// 弃 1 张手牌 → 让所有手牌不足 2 张的盗梦者从牌库顶各抽 2 张
// 回合限 1 次（以技能定义为准；规则未明确次数，保守 ownTurnOncePerTurn）
// 对照：cards-data.json dm_pluto_hell

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
  if (!canUseSkill(master, PLUTO_BURNING_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  const idx = master.hand.indexOf(discardCardId);
  if (idx === -1) return null;

  // 弃 1
  const newHand = [...master.hand];
  newHand.splice(idx, 1);
  let s: SetupState = {
    ...state,
    players: {
      ...state.players,
      [masterID]: { ...master, hand: newHand },
    },
    deck: {
      ...state.deck,
      discardPile: [...state.deck.discardPile, discardCardId],
    },
  };
  s = markSkillUsed(s, masterID, PLUTO_BURNING_SKILL_ID);

  // 所有手牌<2 的存活盗梦者抽 2
  const targets = s.playerOrder.filter((pid) => {
    const p = s.players[pid];
    return p && p.isAlive && p.faction === 'thief' && p.hand.length < PLUTO_DRAW_THRESHOLD;
  });
  for (const pid of targets) {
    s = drawCards(s, pid, PLUTO_DRAW_AMOUNT);
  }
  return s;
}

// ============================================================================
// W16-C 梦主世界观 / 部分主动技能（火星·杀戮 / 冥王星地狱世界观 / 土星领地世界观）
// ============================================================================
// 对照：cards-data.json + docs/manual/06-dream-master.md

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

/** 火星·杀戮：弃掉 1 张解封（不消耗 perTurn 计数；梦魇结算由 game.ts 接入） */
export function applyMarsKillDiscardUnlock(state: SetupState, masterID: string): SetupState | null {
  const master = state.players[masterID];
  if (!master || master.characterId !== 'dm_mars_battlefield') return null;
  if (!master.isAlive) return null;
  const idx = master.hand.indexOf('action_unlock');
  if (idx === -1) return null;

  const newHand = [...master.hand];
  newHand.splice(idx, 1);
  return {
    ...state,
    players: {
      ...state.players,
      [masterID]: { ...master, hand: newHand },
    },
    deck: {
      ...state.deck,
      discardPile: [...state.deck.discardPile, 'action_unlock' as CardID],
    },
  };
}

// === 冥王星·地狱世界观 ===
// 盗梦者抽牌阶段抽牌数 = 1 颗骰子的掷骰结果
// 抽牌阶段后手牌 ≥ 6 → 该盗梦者回合结束时进入迷失层
// 对照：cards-data.json dm_pluto_hell 世界观

const PLUTO_LOST_HAND_THRESHOLD = 6;

/** 冥王星地狱世界观激活 */
export function isPlutoHellWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_pluto_hell';
}

/** 冥王星世界观：本回合结束时检查盗梦者手牌≥6 → 入迷失层 */
export function applyPlutoHellLostCheck(state: SetupState, playerID: string): SetupState {
  if (!isPlutoHellWorldActive(state)) return state;
  const p = state.players[playerID];
  if (!p || !p.isAlive || p.faction !== 'thief') return state;
  if (p.hand.length < PLUTO_LOST_HAND_THRESHOLD) return state;
  if (p.currentLayer === 0) return state;
  return movePlayerToLayer(state, playerID, 0);
}

// === 土星·领地世界观 ===
// 拥有贿赂的盗梦者，自己回合出牌阶段可不用行动牌移动一次到相邻层
// 已有 canSaturnFreeMove 判定；此处加 ID + 应用函数（per-turn）
// 对照：cards-data.json dm_saturn_territory 世界观

export const SATURN_FREE_MOVE_SKILL_ID = 'dm_saturn_territory.world.skill';

/** 土星·领地世界观：盗梦者免费移动到相邻层（自己回合限 1 次） */
export function applySaturnFreeMove(
  state: SetupState,
  playerID: string,
  targetLayer: Layer,
): SetupState | null {
  if (!canSaturnFreeMove(state, playerID)) return null;
  const p = state.players[playerID];
  if (!p) return null;
  if (!canUseSkill(p, SATURN_FREE_MOVE_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  if (targetLayer < 1 || targetLayer > 4) return null;
  if (Math.abs(p.currentLayer - targetLayer) !== 1) return null;

  let s = markSkillUsed(state, playerID, SATURN_FREE_MOVE_SKILL_ID);
  s = movePlayerToLayer(s, playerID, targetLayer);
  return s;
}

/** 土星世界观免费移动是否本回合还可用 */
export function canUseSaturnFreeMoveThisTurn(state: SetupState, playerID: string): boolean {
  if (!canSaturnFreeMove(state, playerID)) return false;
  const p = state.players[playerID];
  if (!p) return false;
  return canUseSkill(p, SATURN_FREE_MOVE_SKILL_ID, 'ownTurnOncePerTurn');
}

// === 天王星·苍穹世界观 ===
// 盗梦者因行动牌效果改变梦境层数 → 牌库顶弃 1 张
// 梦主贿赂派发完毕 → 改弃 2 张
// 复活离开迷失层不属于行动牌效果 → 不弃
// 对照：cards-data.json dm_uranus_firmament 世界观

/** 天王星·苍穹世界观激活 */
export function isUranusFirmamentWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_uranus_firmament';
}

/** 行动牌触发的层数变更 → 梦主弃牌堆弃 1（或 2） */
export function applyUranusFirmamentMoveDiscard(state: SetupState, playerID: string): SetupState {
  if (!isUranusFirmamentWorldActive(state)) return state;
  const p = state.players[playerID];
  if (!p || p.faction !== 'thief') return state;
  // 梦主未派发贿赂为 0 → 弃 2，否则弃 1
  const inPool = state.bribePool.filter((b) => b.status === 'inPool').length;
  const discardCount = inPool === 0 ? 2 : 1;
  const n = Math.min(discardCount, state.deck.cards.length);
  if (n === 0) return state;
  const dropped = state.deck.cards.slice(0, n);
  return {
    ...state,
    deck: {
      ...state.deck,
      cards: state.deck.cards.slice(n),
      discardPile: [...state.deck.discardPile, ...dropped],
    },
  };
}

// === 火星·战场世界观 ===
// 玩家自己回合出牌阶段：弃 2 张非 SHOOT 类牌 → 弃牌堆取任意 1 张 SHOOT 类入手
// 对照：cards-data.json dm_mars_battlefield 世界观

export const MARS_BATTLEFIELD_WORLD_SKILL_ID = 'dm_mars_battlefield.world.skill';

/** 火星·战场世界观激活 */
export function isMarsBattlefieldWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_mars_battlefield';
}

// ============================================================================
// W18-A 梦魇触发时机辅助（auto-detect + un-revealed discard）
// ============================================================================
// 对照：docs/manual/03-game-flow.md 第 94-102 行 / 07-nightmare-cards.md
// 触发：盗梦者打开放有金币的金库 → 同层有未翻开梦魇 → 梦主 3 选 1
//   1. 派发贿赂牌然后弃掉梦魇（masterDealBribe + masterDiscardHiddenNightmare）
//   2. 翻开梦魇并发动效果（masterRevealNightmare + masterActivateNightmare）
//   3. 弃掉梦魇且不派发贿赂（masterDiscardHiddenNightmare）

/** 找出所有「金币金库已开 + 同层有未翻开梦魇」的层（待梦主决策） */
export function findCoinVaultsWithHiddenNightmare(state: SetupState): number[] {
  const result: number[] = [];
  for (const v of state.vaults) {
    if (!v.isOpened) continue;
    if (v.contentType !== 'coin') continue;
    const ls = state.layers[v.layer];
    if (!ls) continue;
    if (!ls.nightmareId) continue;
    if (ls.nightmareRevealed) continue;
    if (ls.nightmareTriggered) continue;
    result.push(v.layer);
  }
  return result;
}

/** 弃掉指定层的未翻开梦魇（用于梦主选择"不发动"流程） */
export function applyDiscardHiddenNightmare(state: SetupState, layer: number): SetupState | null {
  const ls = state.layers[layer];
  if (!ls) return null;
  if (!ls.nightmareId) return null;
  if (ls.nightmareRevealed) return null; // 已翻开走 masterDiscardNightmare
  const discardedId = ls.nightmareId;
  return {
    ...state,
    layers: {
      ...state.layers,
      [layer]: {
        ...ls,
        nightmareId: null,
        nightmareRevealed: false,
        nightmareTriggered: true,
      },
    },
    usedNightmareIds: [...state.usedNightmareIds, discardedId],
  };
}

/** 火星·战场世界观：弃 2 非 SHOOT 换 1 SHOOT */
export function applyMarsBattlefieldExchange(
  state: SetupState,
  playerID: string,
  discardCardIds: [CardID, CardID],
  targetShootCardId: CardID,
): SetupState | null {
  if (!isMarsBattlefieldWorldActive(state)) return null;
  const p = state.players[playerID];
  if (!p || !p.isAlive) return null;
  // 两张要弃的牌必须在手牌里且都不是 SHOOT 类
  const [c1, c2] = discardCardIds;
  if (c1 === c2) {
    // 同名两张：手牌至少需要 2 张同名
    if (p.hand.filter((c) => c === c1).length < 2) return null;
  } else {
    if (!p.hand.includes(c1) || !p.hand.includes(c2)) return null;
  }
  if (isShootClassCard(c1) || isShootClassCard(c2)) return null;
  // 目标 SHOOT 必须是 SHOOT 类且在弃牌堆
  if (!isShootClassCard(targetShootCardId)) return null;
  const targetIdx = state.deck.discardPile.indexOf(targetShootCardId);
  if (targetIdx === -1) return null;

  // 从手牌移除 c1, c2
  const newHand = [...p.hand];
  const i1 = newHand.indexOf(c1);
  newHand.splice(i1, 1);
  const i2 = newHand.indexOf(c2);
  newHand.splice(i2, 1);
  // 加入 SHOOT
  newHand.push(targetShootCardId);

  // 更新弃牌堆：移除目标 SHOOT，追加两张弃牌
  const newDiscard = [...state.deck.discardPile];
  newDiscard.splice(targetIdx, 1);
  newDiscard.push(c1, c2);

  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: { ...p, hand: newHand },
    },
    deck: { ...state.deck, discardPile: newDiscard },
  };
}

// ============================================================================
// 水星·航路 世界观：梦主翻开时 bribePool 额外 +1 张失败贿赂
// 对照：docs/manual/06-dream-master.md 水星·航路
// 接入时机：startGame move 分配梦主角色后立即调用（此时 bribePool 仍为初始 3+3）
// ============================================================================

/**
 * 水星·航路世界观：若梦主为水星，bribePool 追加 1 张 fail 状态的贿赂。
 * 对非水星梦主直接返回原 state。
 */
export function applyMercuryRouteExtraFailBribe(
  state: SetupState,
  masterCharacterID: CardID | null,
): SetupState {
  if (masterCharacterID !== 'dm_mercury_route') return state;
  // 新 fail 贿赂的编号需要避开既有 `bribe-fail-0..2`
  const existingFailIds = new Set(
    state.bribePool.filter((b) => b.id.startsWith('bribe-fail-')).map((b) => b.id),
  );
  let newId = 'bribe-fail-mercury';
  let suffix = 0;
  while (existingFailIds.has(newId)) {
    suffix += 1;
    newId = `bribe-fail-mercury-${suffix}`;
  }
  return {
    ...state,
    bribePool: [
      ...state.bribePool,
      {
        id: newId,
        status: 'inPool',
        heldBy: null,
        originalOwnerId: null,
      },
    ],
  };
}

// ============================================================================
// 金星·镜界 · 重影
// 对照：docs/manual/06-dream-master.md 金星·镜界
// 你的回合出牌前，可展示牌库顶等于非死亡盗梦者数的牌，然后展示任意手牌
// 并将所有展示的同名牌收入手牌，其余混洗放回牌库顶。回合限 1 次
//
// 实现语义：
//   1. N = 非死亡盗梦者数
//   2. 从牌库顶取 N 张（若牌库不足则不足即可，按实际）
//   3. 统计"展示的手牌名字集合"
//   4. 牌库顶取出中，名字 ∈ 手牌集合的 → 进入梦主手牌
//   5. 其余（不匹配的）→ 由调用方提供 shuffle 后的顺序放回牌库顶
// ============================================================================

export const VENUS_DOUBLE_SKILL_ID = 'dm_venus_mirror.skill_0';

/**
 * 金星·重影：纯函数实现。
 * @param state        当前状态
 * @param masterID     梦主 playerID
 * @param revealedHandIds 梦主展示的手牌 id 数组（multiset 视角；必须都在手牌中）
 * @param shuffle      外部注入的 shuffle（用于测试确定性；move 层传入 BGIO random.Shuffle）
 * @returns 新 state 或 null（失败）
 */
export function applyVenusDouble(
  state: SetupState,
  masterID: string,
  revealedHandIds: readonly CardID[],
  shuffle: <T>(arr: readonly T[]) => T[],
): SetupState | null {
  const master = state.players[masterID];
  if (!master) return null;
  if (master.characterId !== 'dm_venus_mirror') return null;
  if (!master.isAlive) return null;
  if (!canUseSkill(master, VENUS_DOUBLE_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  // 展示的手牌必须全部在手中（multiset）
  const handCopy = [...master.hand];
  for (const cid of revealedHandIds) {
    const idx = handCopy.indexOf(cid);
    if (idx === -1) return null;
    handCopy.splice(idx, 1);
  }

  // N = 非死亡盗梦者数
  const aliveThievesCount = Object.values(state.players).filter(
    (p) => p.faction === 'thief' && p.isAlive,
  ).length;
  if (aliveThievesCount <= 0) return null;

  // 牌库不足时按实际可用数量
  const takeN = Math.min(aliveThievesCount, state.deck.cards.length);
  const topSlice = state.deck.cards.slice(0, takeN);
  const restDeck = state.deck.cards.slice(takeN);

  // 匹配：展示的手牌名字集合
  const revealedNames = new Set<string>(revealedHandIds);
  const matched: CardID[] = [];
  const unmatched: CardID[] = [];
  for (const cid of topSlice) {
    if (revealedNames.has(cid)) matched.push(cid);
    else unmatched.push(cid);
  }

  let s = markSkillUsed(state, masterID, VENUS_DOUBLE_SKILL_ID);
  // 匹配的牌入梦主手牌；剩余混洗放回牌库顶
  const shuffledBack = shuffle(unmatched);
  s = {
    ...s,
    deck: { ...s.deck, cards: [...shuffledBack, ...restDeck] },
    players: {
      ...s.players,
      [masterID]: { ...s.players[masterID]!, hand: [...s.players[masterID]!.hand, ...matched] },
    },
  };
  return s;
}

// === 水星·航路 逆流（被动：贿赂者对梦主出牌 → 梦主先收入） ===

export const MERCURY_REVERSE_SKILL_ID = 'dm_mercury_route.skill_1';

/**
 * 水星·航路 逆流技能：同层贿赂者对梦主出牌时，梦主先收入手牌再结算。
 * 限制：回合限 2 次；不能获取时间风暴。
 * 触发时机：onCardPlayedAgainstMaster
 * 对照：cards-data.json dm_mercury_route 逆流
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

  // 出牌者是贿赂者（faction 已转为 master 但不是梦主本人）
  if (cardPlayer.faction !== 'master') return null;

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

// === 皇城世界观 · 贿赂后 SHOOT（纯函数） ===
// 对照：docs/manual/06-dream-master.md 皇城
// 收到贿赂的玩家选一个未收到贿赂的盗梦者视为 SHOOT，掷骰结果 -3
export const IMPERIAL_CITY_WORLD_SKILL_ID = 'dm_imperial_city.world_0';

export function applyImperialCityWorldShoot(
  state: SetupState,
  shooterID: string,
  targetID: string,
  roll: number,
): SetupState | null {
  const shooter = state.players[shooterID];
  const target = state.players[targetID];
  if (!shooter || !target) return null;
  if (!shooter.isAlive || !target.isAlive) return null;
  if (shooterID === targetID) return null;
  if (target.faction !== 'thief') return null;
  if (target.bribeReceived > 0) return null;
  // 普通 SHOOT：deathFaces=[1], moveFaces=[2,3,4,5]
  const modifiedRoll = Math.max(1, roll - 3);
  const result = resolveShootCustom(modifiedRoll, [1], [2, 3, 4, 5]);
  if (result === 'kill') {
    let s = movePlayerToLayer(state, targetID, 0);
    s = {
      ...s,
      players: {
        ...s.players,
        [targetID]: { ...s.players[targetID]!, isAlive: false, deathTurn: s.turnNumber },
      },
    };
    return s;
  }
  if (result === 'move') {
    const cur = state.players[targetID]!.currentLayer;
    const newLayer = cur >= 4 ? cur - 1 : cur + 1;
    return movePlayerToLayer(state, targetID, newLayer as Layer);
  }
  // miss
  return { ...state };
}

// === 复活机制 ===
// 对照：docs/manual/03-game-flow.md 复活

/** 判断是否为密道世界观（只能弃 1 张穿梭剂复活） */
export function isSecretPassageWorldActive(state: SetupState): boolean {
  const master = state.players[state.dreamMasterID];
  return master?.characterId === 'dm_secret_passage';
}

/**
 * 基础复活：弃 2 张手牌复活自己或他人
 * 密道世界观变体：弃 1 张【梦境穿梭剂】复活
 */
export function applyRevive(
  state: SetupState,
  selfID: string,
  targetID: string | null,
  discardedCardIds: CardID[],
): SetupState | null {
  const self = state.players[selfID];
  if (!self) return null;
  const effectiveTarget = targetID ?? selfID;
  const isSelfRevive = effectiveTarget === selfID;

  // 复活自己时允许已死亡（在迷失层复活自己）；复活他人时自己必须存活
  if (!isSelfRevive && !self.isAlive) return null;
  // 复活自己时自己必须在迷失层
  if (isSelfRevive && self.isAlive) return null;

  const target = state.players[effectiveTarget];
  if (!target) return null;
  // 目标必须已死亡
  if (target.isAlive) return null;
  // 复活他人时自己不能在迷失层
  if (!isSelfRevive && self.currentLayer === 0) return null;

  const secretPassage = isSecretPassageWorldActive(state);

  if (secretPassage) {
    // 密道世界观：只能弃 1 张穿梭剂
    if (discardedCardIds.length !== 1) return null;
    if (discardedCardIds[0] !== 'action_dream_transit') return null;
  } else {
    // 基础规则：弃 2 张手牌
    if (discardedCardIds.length !== 2) return null;
  }

  // 校验手牌包含所有弃牌
  for (const cid of discardedCardIds) {
    if (!self.hand.includes(cid)) return null;
  }

  // 弃牌
  const newHand = [...self.hand];
  for (const cid of discardedCardIds) {
    const idx = newHand.indexOf(cid);
    if (idx < 0) return null;
    newHand.splice(idx, 1);
  }

  // 复活目标：isAlive=true, deathTurn=null
  const reviveLayer = effectiveTarget === selfID ? 1 : self.currentLayer;
  let s: SetupState = {
    ...state,
    players: {
      ...state.players,
      [selfID]: { ...self, hand: newHand },
      [effectiveTarget]: {
        ...state.players[effectiveTarget]!,
        isAlive: true,
        deathTurn: null,
      },
    },
    deck: {
      ...state.deck,
      discardPile: [...state.deck.discardPile, ...discardedCardIds],
    },
  };
  s = movePlayerToLayer(s, effectiveTarget, reviveLayer as Layer);
  return s;
}

// === 金星·镜界世界观 · 复制效果 ===
// 对照：docs/manual/06-dream-master.md 金星·镜界
// 弃 2 张牌，重复执行本回合内之前用过的 SHOOT/KICK 效果
export const VENUS_MIRROR_WORLD_SKILL_ID = 'dm_venus_mirror.world_0';

// 可复制的行动牌前缀
const MIRRORABLE_SHOOT_PREFIXES = [
  'action_shoot',
  'action_shoot_king',
  'action_shoot_armor',
  'action_shoot_burst',
  'action_shoot_dream_transit',
];
const MIRRORABLE_KICK = 'action_kick';

function isMirrorableCard(cardId: CardID): boolean {
  return MIRRORABLE_SHOOT_PREFIXES.includes(cardId) || cardId === MIRRORABLE_KICK;
}

export function applyVenusMirrorWorld(
  state: SetupState,
  selfID: string,
  targetID: string,
  discardedCardIds: CardID[],
  roll: number,
): SetupState | null {
  const self = state.players[selfID];
  if (!self || !self.isAlive) return null;
  // 梦主必须是金星·镜界
  const master = state.players[state.dreamMasterID];
  if (!master || master.characterId !== 'dm_venus_mirror') return null;
  // 回合限 1
  if ((self.skillUsedThisTurn[VENUS_MIRROR_WORLD_SKILL_ID] ?? 0) >= 1) return null;
  // 弃 2 张牌
  if (discardedCardIds.length !== 2) return null;
  for (const cid of discardedCardIds) {
    if (!self.hand.includes(cid)) return null;
  }
  // 必须有可复制的牌
  const played = state.playedCardsThisTurn ?? [];
  const mirrorable = played.filter((c) => isMirrorableCard(c));
  if (mirrorable.length === 0) return null;

  const target = state.players[targetID];
  if (!target || !target.isAlive) return null;
  if (selfID === targetID) return null;

  // 弃牌
  const newHand = [...self.hand];
  for (const cid of discardedCardIds) {
    const idx = newHand.indexOf(cid);
    if (idx < 0) return null;
    newHand.splice(idx, 1);
  }

  const lastCard = mirrorable[mirrorable.length - 1]!;
  let s: SetupState = {
    ...state,
    players: {
      ...state.players,
      [selfID]: { ...self, hand: newHand },
    },
    deck: {
      ...state.deck,
      discardPile: [...state.deck.discardPile, ...discardedCardIds],
    },
  };
  s = markSkillUsed(s, selfID, VENUS_MIRROR_WORLD_SKILL_ID);

  if (lastCard === MIRRORABLE_KICK) {
    // KICK 效果：目标击杀 + 拿 2 张手牌
    const tp = s.players[targetID]!;
    const handover = tp.hand.slice(0, 2);
    s = {
      ...s,
      players: {
        ...s.players,
        [targetID]: { ...tp, isAlive: false, deathTurn: s.turnNumber, hand: tp.hand.slice(2) },
        [selfID]: { ...s.players[selfID]!, hand: [...s.players[selfID]!.hand, ...handover] },
      },
    };
    s = movePlayerToLayer(s, targetID, 0);
  } else {
    // SHOOT 效果：普通骰面 [1] 死 [2-4] 移 [5-6] miss
    const result = resolveShootCustom(roll, [1], [2, 3, 4, 5]);
    if (result === 'kill') {
      const tp = s.players[targetID]!;
      const handover = tp.hand.slice(0, 2);
      s = {
        ...s,
        players: {
          ...s.players,
          [targetID]: { ...tp, isAlive: false, deathTurn: s.turnNumber, hand: tp.hand.slice(2) },
          [selfID]: { ...s.players[selfID]!, hand: [...s.players[selfID]!.hand, ...handover] },
        },
      };
      s = movePlayerToLayer(s, targetID, 0);
    } else if (result === 'move') {
      const cur = s.players[targetID]!.currentLayer;
      const newLayer = cur >= 4 ? cur - 1 : cur + 1;
      s = movePlayerToLayer(s, targetID, newLayer as Layer);
    }
    // miss: 无效果
  }
  return s;
}
