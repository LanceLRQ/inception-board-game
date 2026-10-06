// 死亡 + 迷失层
// 对照：docs/manual/03-game-flow.md 死亡 / 迷失层；docs/manual/08-appendix.md 迷失层术语
//
// 「在迷失层」与「已死亡」是同一个状态：迷失层表示玩家正处于死亡状态（08-appendix 迷失层条目），
// 复活的各个入口都以 isAlive=false 为前提，响应者名单、选目标、终局判断都只看 isAlive。
// 所以把人送进迷失层只有这里两个入口：
//   - sendToLimbo：非击杀进入（梦魇 / 世界观 / 技能直接送走 / 自尽），不交手牌
//   - killPlayer：被击杀，被害者把手牌交给凶手
// 对照：03-game-flow 死亡一节「被害者选出 2 张手牌给予凶手，不足 2 张则全部给予」

import type { SetupState, PlayerSetup, LayerSetup } from '../setup.js';
import type { Layer } from '@icgame/shared';

export const LOST_LAYER: Layer = 0 as Layer;

/** 击杀时被害者交给凶手的手牌张数 */
export const KILL_HANDOVER_COUNT = 2;

/** 判定玩家当前是否可以行动（非死亡 + 非迷失层滞留） */
export function canAct(player: PlayerSetup): boolean {
  return player.isAlive && player.currentLayer !== LOST_LAYER;
}

function emptyLimboLayer(): LayerSetup {
  return {
    layer: LOST_LAYER,
    dreamCardId: null,
    nightmareId: null,
    nightmareRevealed: false,
    nightmareTriggered: false,
    playersInLayer: [],
    heartLockValue: 0,
  };
}

/**
 * 只改位置：把玩家从旧层名单挪到目标层名单，不碰存活状态。
 * 进入迷失层必须走 sendToLimbo / killPlayer，这里只供它们与 movePlayerToLayer 使用。
 */
export function placePlayerInLayer(
  state: SetupState,
  playerID: string,
  targetLayer: number,
): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const oldLayer = player.currentLayer;
  // 同层移动是空操作：下面两个层的写入若是同一个 key，后写的会覆盖，名单里会出现重复的 playerID
  if (oldLayer === targetLayer) return state;

  // 状态里没有这一层的条目时（迷失层开局就没有条目；测试夹具也可能缺层）补一个只含名单的空条目
  const fallback = (layer: number): LayerSetup =>
    layer === LOST_LAYER ? emptyLimboLayer() : ({ playersInLayer: [] } as unknown as LayerSetup);
  const from = state.layers[oldLayer] ?? fallback(oldLayer);
  const to = state.layers[targetLayer] ?? fallback(targetLayer);

  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: { ...player, currentLayer: targetLayer as Layer },
    },
    layers: {
      ...state.layers,
      [oldLayer]: {
        ...from,
        playersInLayer: from.playersInLayer.filter((id) => id !== playerID),
      },
      [targetLayer]: {
        ...to,
        // 防御性去重：目标层名单里已有该玩家时不重复加入
        playersInLayer: to.playersInLayer.includes(playerID)
          ? to.playersInLayer
          : [...to.playersInLayer, playerID],
      },
    },
  };
}

/**
 * 非击杀进入迷失层：挪到第 0 层、isAlive=false、deathTurn=当前回合，手牌留在原处。
 * 对照：03-game-flow 迷失层「玩家会因为死亡等原因进入迷失层」；
 *       06-dream-master 港口·海啸「跳过击杀状态，没有凶手与被害者，不用给予手牌」
 * 已经死在迷失层的玩家调用它是空操作。
 */
export function sendToLimbo(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player) return state;
  if (player.currentLayer === LOST_LAYER && !player.isAlive) return state;
  const placed = placePlayerInLayer(state, playerID, LOST_LAYER);
  const current = placed.players[playerID]!;
  return {
    ...placed,
    players: {
      ...placed.players,
      [playerID]: { ...current, isAlive: false, deathTurn: state.turnNumber },
    },
  };
}

/**
 * 被击杀：在 sendToLimbo 之上，被害者把手牌的前 handoverCount 张交给凶手（不足则全给），
 * 凶手的击杀计数 +1。默认张数见 KILL_HANDOVER_COUNT；雅典娜·惊叹取走全部手牌。
 * 对照：03-game-flow 死亡
 * 被害者已死在迷失层时是空操作，不会重复交牌。
 */
export function killPlayer(
  state: SetupState,
  victimID: string,
  killerID: string,
  handoverCount: number = KILL_HANDOVER_COUNT,
): SetupState {
  const victim = state.players[victimID];
  const killer = state.players[killerID];
  if (!victim || !killer) return state;
  if (victim.currentLayer === LOST_LAYER && !victim.isAlive) return state;

  const handover = victim.hand.slice(0, handoverCount);
  const limbo = sendToLimbo(state, victimID);
  return {
    ...limbo,
    players: {
      ...limbo.players,
      [victimID]: { ...limbo.players[victimID]!, hand: victim.hand.slice(handoverCount) },
      [killerID]: {
        ...limbo.players[killerID]!,
        hand: [...limbo.players[killerID]!.hand, ...handover],
        shootCount: limbo.players[killerID]!.shootCount + 1,
      },
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
