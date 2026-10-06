// 核心 Move 定义 - 回合流程

import { HAND_LIMIT, BASE_DRAW_COUNT } from './config.js';
import type { SetupState, PlayerSetup } from './setup.js';
import { LOST_LAYER, placePlayerInLayer, sendToLimbo } from './engine/death.js';

// === 抽牌阶段 ===
// 纯函数：不 mutate 入参，以免与 BGIO/immer draft 行为冲突
export function drawCards(
  state: SetupState,
  playerID: string,
  drawCount: number = BASE_DRAW_COUNT,
): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const drawn = state.deck.cards.slice(0, drawCount);
  if (drawn.length === 0) return state;

  const remaining = state.deck.cards.slice(drawCount);

  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: {
        ...player,
        hand: [...player.hand, ...drawn],
      },
    },
    deck: {
      ...state.deck,
      cards: remaining,
    },
  };
}

// === 时间风暴 ===
const TIME_STORM_ID = 'action_time_storm' as CardID;
const TIME_STORM_FLIP_COUNT = 10;

/**
 * 时间风暴的效果：从牌库顶弃掉 10 张牌（进弃牌堆，不足则全弃），然后风暴自己移出游戏。
 * 调用时风暴牌已在弃牌堆顶（刚从手中弃出）。牌库被翻空后的胜负由终局判定处理。
 * 对照：docs/manual/04-action-cards.md 时间风暴（发动效果与解析）
 */
function resolveTimeStorm(state: SetupState): SetupState {
  const pile = [...state.deck.discardPile];
  const stormIdx = pile.lastIndexOf(TIME_STORM_ID);
  if (stormIdx !== -1) pile.splice(stormIdx, 1);
  const flipCount = Math.min(TIME_STORM_FLIP_COUNT, state.deck.cards.length);
  return {
    ...state,
    deck: {
      ...state.deck,
      cards: state.deck.cards.slice(flipCount),
      discardPile: [...pile, ...state.deck.cards.slice(0, flipCount)],
    },
    removedFromGame: [...state.removedFromGame, TIME_STORM_ID],
  };
}

// === 从手中弃牌（唯一入口）===
// 手牌 → 弃牌堆的所有路径都走这里：弃牌阶段、复活代价、技能代价、梦魇逼弃、被效果弃掉手牌，
// 以及打出时间风暴本身。弃出的是时间风暴则触发其效果；
// 打出别的行动牌后进弃牌堆、交给别人、被抽走、放回牌库顶都不是「弃掉」，不走这里的触发。
// 对照：docs/manual/04-action-cards.md 时间风暴「从手中使用或弃掉，同样触发效果」
export function discardCard(state: SetupState, playerID: string, cardId: CardID): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const idx = player.hand.indexOf(cardId);
  if (idx === -1) return state;

  const newHand = [...player.hand];
  newHand.splice(idx, 1);

  const discarded: SetupState = {
    ...state,
    players: {
      ...state.players,
      [playerID]: {
        ...player,
        hand: newHand,
      },
    },
    deck: {
      ...state.deck,
      discardPile: [...state.deck.discardPile, cardId],
    },
  };
  return cardId === TIME_STORM_ID ? resolveTimeStorm(discarded) : discarded;
}

/** 从手中依次弃掉多张牌，每张时间风暴各触发一次 */
export function discardCards(
  state: SetupState,
  playerID: string,
  cardIds: readonly CardID[],
): SetupState {
  let s = state;
  for (const cardId of cardIds) s = discardCard(s, playerID, cardId);
  return s;
}

// 强制弃至手牌上限
export function discardToLimit(
  state: SetupState,
  playerID: string,
  cardsToDiscard: CardID[],
): SetupState {
  return discardCards(state, playerID, cardsToDiscard);
}

// 需要弃牌的手牌数
export function getDiscardCount(player: PlayerSetup): number {
  return Math.max(0, player.hand.length - HAND_LIMIT);
}

// === 回合开始 ===
export function beginTurn(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  return {
    ...state,
    turnPhase: 'draw',
    turnNumber: state.turnNumber + 1,
    currentPlayerID: playerID,
    unlockThisTurn: 0,
    // 出牌追踪 · 每回合清零（对照：setup.ts playedCardsThisTurn 注释）
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
    lastShootRoll: null,
    // 注意：不要在这里清空 removedFromGame —— 它是跨回合持久的"移出游戏"区，
    // 仅由 setup 初始化一次，由 time_storm 等 move 追加
    players: {
      ...state.players,
      [playerID]: {
        ...player,
        skillUsedThisTurn: {},
        successfulUnlocksThisTurn: 0,
      },
    },
  };
}

/**
 * 记录本回合打出一张行动牌 · 追加到 playedCardsThisTurn + 更新 lastPlayedCardThisTurn。
 * 由所有 playXxx move 在成功结算后调用（不改变其他状态，纯追加日志）。
 * 水星/金星/格林射线等能力
 */
export function recordCardPlayed(state: SetupState, cardId: string): SetupState {
  // 兼容早期 schema：字段缺失时 fallback 成空数组
  const prev = Array.isArray(state.playedCardsThisTurn) ? state.playedCardsThisTurn : [];
  return {
    ...state,
    playedCardsThisTurn: [...prev, cardId as SetupState['playedCardsThisTurn'][number]],
    lastPlayedCardThisTurn: cardId as SetupState['lastPlayedCardThisTurn'],
  };
}

// === 回合结束 ===
export function endTurn(state: SetupState): SetupState {
  const order = state.playerOrder;
  const currentIdx = order.indexOf(state.currentPlayerID);
  const nextIdx = (currentIdx + 1) % order.length;
  const nextPlayerID = order[nextIdx]!;

  return {
    ...state,
    turnPhase: 'turnEnd',
    // 下一回合开始时会调用 beginTurn 设置 draw phase
    currentPlayerID: nextPlayerID,
  };
}

// === 切换回合阶段 ===
export function setTurnPhase(state: SetupState, phase: SetupState['turnPhase']): SetupState {
  return { ...state, turnPhase: phase };
}

// === 移动玩家到层 ===
// 目标层为 0（迷失层）时等价于 sendToLimbo：迷失层与死亡是同一个状态，不允许只挪层不置死亡。
// 击杀（要交手牌）请直接调用 killPlayer。
export function movePlayerToLayer(
  state: SetupState,
  playerID: string,
  targetLayer: number,
): SetupState {
  if (targetLayer === LOST_LAYER) return sendToLimbo(state, playerID);
  return placePlayerInLayer(state, playerID, targetLayer);
}

// === 判断相邻层 ===
export function isAdjacentLayer(from: number, to: number): boolean {
  return Math.abs(from - to) === 1;
}

// === Move counter 递增 ===
export function incrementMoveCounter(state: SetupState): SetupState {
  return { ...state, moveCounter: state.moveCounter + 1 };
}

// === 改变某层心锁 ===
// 全引擎所有改变心锁的路径（解封、技能、梦魇、世界观）都经这里。
// 减少到 0 时翻开该层第一个未开金库并记录 openedBy。
// 对照：docs/manual/03-game-flow.md:34 当某一层的心锁全部被解开时，该层的金库便被打开
//
// 只管心锁与金库；金库打开后的结算（金币给贿赂牌、秘密判胜）由调用方在其后处理，
// 「解封成功」才触发的被动（译梦师·伏笔、梦境猎手·满载、onUnlock）也不在这里。
//
// actorID：减少心锁的发动者，翻开的金库记在他名下。
// bySkill：发动者靠技能减少心锁。裁定 R-23：这也算本回合的成功解锁，
//   占用解锁次数（见 skills.ts 的 canMakeSuccessfulUnlock）；心锁实际没减少则不计。
//   对照：docs/manual/03-game-flow.md:26-28 一旦本回合心锁减少后，盗梦者不能再以技能或行动的方式解锁
export const HEART_LOCK_REDUCED_BY_SKILL_KEY = 'heartLockReducedBySkill';

export function setLayerHeartLock(
  state: SetupState,
  layer: number,
  nextValue: number,
  opts: { actorID?: string; bySkill?: boolean } = {},
): SetupState {
  const layerState = state.layers[layer];
  if (!layerState) return state;
  const next = Math.max(0, nextValue);
  if (next === layerState.heartLockValue) return state;

  const reduced = next < layerState.heartLockValue;
  let vaults = state.vaults;
  if (reduced && next === 0) {
    const vaultIdx = vaults.findIndex((v) => v.layer === layer && !v.isOpened);
    if (vaultIdx !== -1) {
      vaults = vaults.map((v, i) =>
        i === vaultIdx ? { ...v, isOpened: true, openedBy: opts.actorID ?? null } : v,
      );
    }
  }

  let players = state.players;
  const actor = opts.actorID ? players[opts.actorID] : undefined;
  if (reduced && opts.bySkill && actor) {
    players = {
      ...players,
      [actor.id]: {
        ...actor,
        skillUsedThisTurn: {
          ...actor.skillUsedThisTurn,
          [HEART_LOCK_REDUCED_BY_SKILL_KEY]:
            (actor.skillUsedThisTurn[HEART_LOCK_REDUCED_BY_SKILL_KEY] ?? 0) + 1,
        },
      },
    };
  }

  return {
    ...state,
    layers: { ...state.layers, [layer]: { ...layerState, heartLockValue: next } },
    vaults,
    players,
  };
}

// === 解封成功结算 ===
// 对照：docs/manual/04-action-cards.md 解封
export function applyUnlockSuccess(state: SetupState): SetupState {
  const pending = state.pendingUnlock;
  if (!pending) return state;

  const { playerID, layer } = pending;
  const layerState = state.layers[layer];
  if (!layerState) return state;

  const lowered = setLayerHeartLock(state, layer, layerState.heartLockValue - 1, {
    actorID: playerID,
  });
  const player = lowered.players[playerID]!;

  return {
    ...lowered,
    pendingUnlock: null,
    players: {
      ...lowered.players,
      [playerID]: {
        ...player,
        successfulUnlocksThisTurn: player.successfulUnlocksThisTurn + 1,
        unlockCount: player.unlockCount + 1,
      },
    },
  };
}

// === 取消解封 ===
export function applyUnlockCancel(state: SetupState): SetupState {
  return {
    ...state,
    pendingUnlock: null,
  };
}

// 导入 CardID 类型
import type { CardID } from '@icgame/shared';
