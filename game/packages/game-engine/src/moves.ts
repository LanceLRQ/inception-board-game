// 核心 Move 定义 - 回合流程
// 对照：plans/design/02-game-rules-spec.md §2.3

import { HAND_LIMIT, BASE_DRAW_COUNT } from './config.js';
import type { SetupState, PlayerSetup } from './setup.js';

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
    // 出牌追踪 · 每回合清零（对照：setup.ts playedCardsThisTurn 注释）
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
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
 * 对照：plans/design/02-game-rules-spec.md §2.4 水星/金星/格林射线等能力
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
export function movePlayerToLayer(
  state: SetupState,
  playerID: string,
  targetLayer: number,
): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const oldLayer = player.currentLayer;

  // W19-B Bug fix（2026-04-21 · client React key 重复）：
  //   若 targetLayer === oldLayer（移到自身当前层 / 同层移动 no-op），
  //   下方 layers[oldLayer]/[targetLayer] 写入同一 key，[targetLayer] 后写覆盖 →
  //   playersInLayer = [...原数组, playerID] 含重复 playerID，
  //   导致 client LayerMap PlayerBadge key 重复警告。
  //   早返回保留原 state，行为与"未移动"一致。
  if (oldLayer === targetLayer) return state;

  // 从旧层移除
  const oldLayerPlayers =
    state.layers[oldLayer]?.playersInLayer.filter((id) => id !== playerID) ?? [];

  // 加入新层（防御性 dedupe：若 target 层数组已含 playerID，避免重复）
  const targetExisting = state.layers[targetLayer]?.playersInLayer ?? [];
  const newLayerPlayers = targetExisting.includes(playerID)
    ? targetExisting
    : [...targetExisting, playerID];

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

// === 解封成功结算 ===
// 对照：docs/manual/04-action-cards.md 解封 + plans/design/02-game-rules-spec.md §2.4
export function applyUnlockSuccess(state: SetupState): SetupState {
  const pending = state.pendingUnlock;
  if (!pending) return state;

  const { playerID, layer } = pending;
  const layerState = state.layers[layer];
  if (!layerState) return state;

  const newHeartLock = Math.max(0, layerState.heartLockValue - 1);

  // 心锁归零 → 打开该层第一个未开金库
  let updatedVaults = state.vaults;
  if (newHeartLock === 0) {
    const vaultIdx = state.vaults.findIndex((v) => v.layer === layer && !v.isOpened);
    if (vaultIdx !== -1) {
      updatedVaults = state.vaults.map((v, i) =>
        i === vaultIdx ? { ...v, isOpened: true, openedBy: playerID } : v,
      );
    }
  }

  const player = state.players[playerID]!;

  return {
    ...state,
    pendingUnlock: null,
    layers: {
      ...state.layers,
      [layer]: {
        ...layerState,
        heartLockValue: newHeartLock,
      },
    },
    vaults: updatedVaults,
    players: {
      ...state.players,
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
