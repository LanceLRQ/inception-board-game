// 核心 Move 定义 - 回合流程
// 对照：plans/design/02-game-rules-spec.md §2.3

import { HAND_LIMIT, BASE_DRAW_COUNT } from './config.js';
import type { SetupState, PlayerSetup } from './setup.js';

// === 抽牌阶段 ===
export function drawCards(
  state: SetupState,
  playerID: string,
  drawCount: number = BASE_DRAW_COUNT,
): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const drawn = state.deck.cards.splice(0, drawCount);
  if (drawn.length === 0) return state;

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
      cards: [...state.deck.cards],
    },
  };
}

// === 弃牌阶段 ===
export function discardCard(state: SetupState, playerID: string, cardId: CardID): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const idx = player.hand.indexOf(cardId);
  if (idx === -1) return state;

  const newHand = [...player.hand];
  newHand.splice(idx, 1);

  return {
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
}

// 强制弃至手牌上限
export function discardToLimit(
  state: SetupState,
  playerID: string,
  cardsToDiscard: CardID[],
): SetupState {
  let s = state;
  for (const cardId of cardsToDiscard) {
    s = discardCard(s, playerID, cardId);
  }
  return s;
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
export function movePlayerToLayer(
  state: SetupState,
  playerID: string,
  targetLayer: number,
): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const oldLayer = player.currentLayer;

  // 从旧层移除
  const oldLayerPlayers =
    state.layers[oldLayer]?.playersInLayer.filter((id) => id !== playerID) ?? [];

  // 加入新层
  const newLayerPlayers = [...(state.layers[targetLayer]?.playersInLayer ?? []), playerID];

  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: { ...player, currentLayer: targetLayer as import('@icgame/shared').Layer },
    },
    layers: {
      ...state.layers,
      [oldLayer]: {
        ...state.layers[oldLayer]!,
        playersInLayer: oldLayerPlayers,
      },
      [targetLayer]: {
        ...state.layers[targetLayer]!,
        playersInLayer: newLayerPlayers,
      },
    },
  };
}

// === 判断相邻层 ===
export function isAdjacentLayer(from: number, to: number): boolean {
  return Math.abs(from - to) === 1;
}

// === Move counter 递增 ===
export function incrementMoveCounter(state: SetupState): SetupState {
  return { ...state, moveCounter: state.moveCounter + 1 };
}

// 导入 CardID 类型
import type { CardID } from '@icgame/shared';
