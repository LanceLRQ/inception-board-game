// 角色技能运行时执行器
// MVP 4 角色：先锋（突袭）/ 译梦师（伏笔）/ 要塞（冷酷）/ 棋局（易位）
// 对照：docs/manual/05-dream-thieves.md / 06-dream-master.md

import type { SetupState, PlayerSetup } from '../setup.js';
import { drawCards, movePlayerToLayer, incrementMoveCounter } from '../moves.js';
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
