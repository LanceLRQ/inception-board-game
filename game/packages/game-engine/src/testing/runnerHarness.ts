// 经对局运行器驱动真实 move 的测试脚手架：建局、装载快照、固定骰值。
// 仅供测试使用，不从包入口导出。

import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { createTestState, makeLayer } from './fixtures.js';
import {
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type RandomSource,
} from '../runner/matchRunner.js';

export const game: GameDef<SetupState> = InceptionCityGame;

export const c = (id: string) => id as CardID;
export const KICK = c('action_kick');
export const UNLOCK = c('action_unlock');
export const SHOOT = c('action_shoot');
export const TRANSIT = c('action_dream_transit');
export const TIME_STORM = c('action_time_storm');
export const TURN = 5;

export function fixedRandom(roll: number): RandomSource {
  return { D6: () => roll, Die: () => roll, Shuffle: (arr) => arr };
}

export function load(G: SetupState): MatchState<SetupState> {
  return matchFromSnapshot<SetupState>({
    G,
    ctx: {
      numPlayers: G.playerOrder.length,
      playOrder: G.playerOrder,
      playOrderPos: G.playerOrder.indexOf(G.currentPlayerID),
      currentPlayer: G.currentPlayerID,
      phase: 'playing',
      turn: 1,
    },
    rngState: 1,
    stateID: 0,
  });
}

export interface Placement {
  layer: number;
  hand: CardID[];
}

/** 按摆放表建局（默认 p1 p2 p3 p4 盗梦者 + pM 梦主），层内名单与玩家所在层一致 */
export function scene(
  placements: Record<string, Placement>,
  extra: Partial<SetupState> = {},
): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: TURN,
    currentPlayerID: 'pM',
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
  });
  const players = { ...base.players };
  const layers: SetupState['layers'] = {
    1: makeLayer(1 as Layer, { heartLockValue: 3 }),
    2: makeLayer(2 as Layer, { heartLockValue: 3 }),
    3: makeLayer(3 as Layer),
    4: makeLayer(4 as Layer),
  };
  for (const [id, place] of Object.entries(placements)) {
    players[id] = { ...players[id]!, currentLayer: place.layer as Layer, hand: place.hand };
    layers[place.layer]!.playersInLayer.push(id);
  }
  return { ...base, players, layers, ...extra };
}

/** 改某个玩家的字段 */
export function withPlayer(
  G: SetupState,
  id: string,
  patch: Partial<SetupState['players'][string]>,
): SetupState {
  return { ...G, players: { ...G.players, [id]: { ...G.players[id]!, ...patch } } };
}
