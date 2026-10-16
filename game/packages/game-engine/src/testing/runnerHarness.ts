// 经对局运行器驱动真实 move 的测试脚手架：建局、装载快照、固定骰值。
// 仅供测试使用，不从包入口导出。

import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { createTestState, makeLayer } from './fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type ApplyMoveOptions,
  type GameDef,
  type MatchState,
  type MoveOutcome,
  type MoveRequest,
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

/**
 * 与 applyMove 相同，接受后若开了掷骰闸门，就用同一个随机源把闸门掷完，事件按步合并。
 * 给只关心「一次出牌结算完是什么样」的测试用；要停在闸门上检查时直接用 applyMove。
 */
export function applyMoveSettled(
  gameDef: GameDef<SetupState>,
  state: MatchState<SetupState>,
  request: MoveRequest,
  options: ApplyMoveOptions = {},
): MoveOutcome<SetupState> {
  const first = applyMove(gameDef, state, request, options);
  if (!first.ok || request.move === 'rollDice') return first;
  let outcome = first;
  const events = [...first.events];
  while (
    outcome.ok &&
    outcome.state.G.pendingDiceRoll &&
    outcome.state.ctx.gameover === undefined
  ) {
    const gate = outcome.state.G.pendingDiceRoll;
    const roller = gate.rollers.find((id) => !gate.rolled.includes(id))!;
    const next = applyMove(
      gameDef,
      outcome.state,
      { playerID: roller, move: 'rollDice', args: [] },
      options,
    );
    if (!next.ok) throw new Error(`rollDice 被拒绝：${next.reason}`);
    events.push(...next.events);
    outcome = next;
  }
  return { ...outcome, events };
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
