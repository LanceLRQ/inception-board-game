// 死亡 + 迷失层 - MVP 简化版
// 对照：docs/manual/03-game-flow.md 死亡规则 + plans/design/02-game-rules-spec.md §2.5
//
// MVP 规则：
//   - 玩家死亡（SHOOT kill / 梦魇）→ isAlive=false + deathTurn=当前回合
//   - 死亡后移至迷失层（layer=0）
//   - 死亡玩家跳过所有回合（beginTurn / drawPhase / actionPhase 空转）
//   - 手牌全部上交给击杀者（SHOOT 规则）；如是梦魇致死则弃至弃牌堆
//   - MVP 不实装复活（Phase 3 的角色技能如「殉道者」才会接入复活）

import type { SetupState, PlayerSetup } from '../setup.js';
import type { CardID, Layer } from '@icgame/shared';

export const LOST_LAYER: Layer = 0 as Layer;

export type DeathCause = 'shoot' | 'nightmare' | 'skill' | 'system';

export interface DeathEvent {
  readonly playerID: string;
  readonly cause: DeathCause;
  readonly killerID: string | null;
  readonly turn: number;
  readonly handTransfer: CardID[]; // 转交手牌（0 长度表示弃至弃牌堆）
}

/** 判定玩家当前是否可以行动（非死亡 + 非迷失层滞留） */
export function canAct(player: PlayerSetup): boolean {
  return player.isAlive && player.currentLayer !== LOST_LAYER;
}

/** 处理死亡：返回新状态 + 死亡事件 */
export function applyDeath(
  state: SetupState,
  playerID: string,
  cause: DeathCause,
  killerID: string | null = null,
): { state: SetupState; event: DeathEvent } {
  const player = state.players[playerID];
  if (!player || !player.isAlive) {
    // 已死亡，no-op
    return {
      state,
      event: {
        playerID,
        cause,
        killerID,
        turn: state.turnNumber,
        handTransfer: [],
      },
    };
  }

  const handTransfer = [...player.hand];
  const oldLayer = player.currentLayer;

  // 从旧层移除
  const oldLayerState = state.layers[oldLayer];
  const updatedLayers = oldLayerState
    ? {
        ...state.layers,
        [oldLayer]: {
          ...oldLayerState,
          playersInLayer: oldLayerState.playersInLayer.filter((id) => id !== playerID),
        },
      }
    : state.layers;

  // 更新玩家：isAlive=false, deathTurn, hand=[], currentLayer=LOST_LAYER
  const updatedPlayer: PlayerSetup = {
    ...player,
    isAlive: false,
    deathTurn: state.turnNumber,
    hand: [],
    currentLayer: LOST_LAYER,
  };

  // 手牌分配：SHOOT 致死 → 击杀者获得手牌；其他 → 弃牌堆
  let nextPlayers = { ...state.players, [playerID]: updatedPlayer };
  let nextDeck = state.deck;
  if (cause === 'shoot' && killerID && state.players[killerID]) {
    const killer = state.players[killerID];
    nextPlayers = {
      ...nextPlayers,
      [killerID]: {
        ...killer,
        hand: [...killer.hand, ...handTransfer],
        shootCount: killer.shootCount + 1,
      },
    };
  } else {
    // 其他死因：弃至弃牌堆
    nextDeck = { ...state.deck, discardPile: [...state.deck.discardPile, ...handTransfer] };
  }

  return {
    state: {
      ...state,
      players: nextPlayers,
      layers: updatedLayers,
      deck: nextDeck,
    },
    event: {
      playerID,
      cause,
      killerID,
      turn: state.turnNumber,
      handTransfer: cause === 'shoot' ? handTransfer : [],
    },
  };
}

/** 判断是否所有盗梦者都死亡（梦主获胜条件之一） */
export function allThievesDead(state: SetupState): boolean {
  const thieves = state.playerOrder.filter((id) => state.players[id]?.faction === 'thief');
  if (thieves.length === 0) return false;
  return thieves.every((id) => !state.players[id]?.isAlive);
}

/** 获取所有存活玩家 ID */
export function getAlivePlayers(state: SetupState): string[] {
  return state.playerOrder.filter((id) => state.players[id]?.isAlive);
}

/** 获取某层的存活玩家 */
export function getAliveInLayer(state: SetupState, layer: number): string[] {
  const ls = state.layers[layer];
  if (!ls) return [];
  return ls.playersInLayer.filter((id) => state.players[id]?.isAlive);
}
