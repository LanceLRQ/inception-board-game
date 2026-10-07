// 盛夏·充盈：梦主抽牌阶段，每拥有 1 张未派发的贿赂牌则多抽牌 1 张；已派出的不算。
// 经对局运行器驱动真实的抽牌 move。
// 对照：docs/manual/06-dream-master.md 盛夏

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { createTestState, withBribes } from './testing/fixtures.js';
import { BASE_DRAW_COUNT } from './config.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type RandomSource,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;
const KICK = 'action_kick' as CardID;

const random: RandomSource = { D6: () => 3, Die: () => 3, Shuffle: (arr) => arr };

function load(G: SetupState): MatchState<SetupState> {
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

function masterDrawHand(statuses: Array<'inPool' | 'dealt' | 'deal'>): number {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'draw',
    turnNumber: 5,
    currentPlayerID: 'pM',
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(40).fill(KICK), discardPile: [] },
  });
  const G = withBribes(
    {
      ...base,
      players: {
        ...base.players,
        pM: { ...base.players.pM!, characterId: 'dm_midsummer' as CardID },
      },
    },
    statuses.map((status) => ({ kind: 'fail' as const, status })),
  );
  const res = applyMove(game, load(G), { playerID: 'pM', move: 'doDraw', args: [] }, { random });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('doDraw 被拒绝');
  return res.state.G.players.pM!.hand.length;
}

describe('盛夏·充盈只数未派发的贿赂牌', () => {
  it('池里 6 张、已派出 2 张：多抽 4 张', () => {
    const hand = masterDrawHand(['inPool', 'inPool', 'inPool', 'inPool', 'dealt', 'dealt']);
    expect(hand).toBe(BASE_DRAW_COUNT + 4);
  });

  it('成功牌已派出（转阵营）同样不算', () => {
    const hand = masterDrawHand(['inPool', 'inPool', 'deal']);
    expect(hand).toBe(BASE_DRAW_COUNT + 2);
  });

  it('全部派出则不多抽', () => {
    expect(masterDrawHand(['dealt', 'dealt'])).toBe(BASE_DRAW_COUNT);
  });
});
