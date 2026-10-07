// 弃牌参数校验、欺诈师旧 move 移除、水星追加贿赂牌编号、解封无响应者的即时结算
// 全部经对局运行器驱动真实 move（水星编号走纯函数，因为它在开局流程里调用）。
// 对照：docs/manual/03-game-flow.md 弃牌阶段；docs/manual/04-action-cards.md 解封 / 时间风暴；
//       docs/manual/06-dream-master.md 水星·航路

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { applyMercuryRouteExtraFailBribe } from './engine/skills.js';
import { createTestState, makePlayer } from './testing/fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

const SHOOT = 'action_shoot' as CardID;
const KICK = 'action_kick' as CardID;
const UNLOCK = 'action_unlock' as CardID;
const STORM = 'action_time_storm' as CardID;

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

function discardState(hand: CardID[]): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'discard',
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
  });
  return {
    ...base,
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
    players: {
      ...base.players,
      p1: makePlayer({ id: 'p1', faction: 'thief', currentLayer: 1 as Layer, hand }),
    },
  };
}

function expectRejected(G: SetupState, move: string, args: unknown[], reason = 'invalid_move') {
  const s = load(G);
  const res = applyMove(game, s, { playerID: G.currentPlayerID, move, args });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe(reason);
  expect(res.state).toBe(s);
}

describe('doDiscard 参数校验', () => {
  const hand6 = [SHOOT, SHOOT, KICK, KICK, UNLOCK, UNLOCK] as CardID[];

  it('rejects a card that is not in hand', () => {
    expectRejected(discardState(hand6), 'doDiscard', [['action_creation']]);
  });

  it('rejects the same card twice when hand holds only one copy', () => {
    const G = discardState([SHOOT, KICK, KICK, UNLOCK, UNLOCK, UNLOCK] as CardID[]);
    expectRejected(G, 'doDiscard', [[SHOOT, SHOOT]]);
  });

  it('rejects an empty list when hand is over the limit', () => {
    expectRejected(discardState(hand6), 'doDiscard', [[]]);
  });

  it('rejects discarding too few cards to reach the limit', () => {
    const G = discardState([...hand6, KICK] as CardID[]);
    expectRejected(G, 'doDiscard', [[SHOOT]]);
  });

  it('accepts discarding exactly the overflow', () => {
    const s = load(discardState(hand6));
    const res = applyMove(game, s, { playerID: 'p1', move: 'doDiscard', args: [[SHOOT]] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.players['p1']!.hand).toHaveLength(5);
  });

  it('accepts duplicates when hand holds enough copies', () => {
    const s = load(discardState([...hand6, SHOOT] as CardID[]));
    const res = applyMove(game, s, { playerID: 'p1', move: 'doDiscard', args: [[SHOOT, SHOOT]] });
    expect(res.ok).toBe(true);
  });

  it('does not flip the deck for time storms that are not in hand', () => {
    const G = discardState(hand6);
    expectRejected(G, 'doDiscard', [[STORM, STORM, STORM]]);
  });

  it('counts time storm flips by cards actually discarded', () => {
    const G = discardState([STORM, KICK, KICK, UNLOCK, UNLOCK, UNLOCK] as CardID[]);
    const s = load(G);
    const res = applyMove(game, s, { playerID: 'p1', move: 'doDiscard', args: [[STORM]] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.G.deck.cards).toHaveLength(20);
      expect(res.state.G.removedFromGame.filter((c) => c === STORM)).toHaveLength(1);
    }
  });

  it('ignores the limit while a living Cancer shelters the player', () => {
    const G = discardState(hand6);
    const sheltered: SetupState = {
      ...G,
      players: {
        ...G.players,
        p2: makePlayer({
          id: 'p2',
          faction: 'thief',
          characterId: 'thief_cancer' as CardID,
          currentLayer: 1 as Layer,
        }),
      },
    };
    const res = applyMove(game, load(sheltered), { playerID: 'p1', move: 'doDiscard', args: [[]] });
    expect(res.ok).toBe(true);
  });
});

describe('欺诈师旧 move', () => {
  it('rejects playForgerExchange because the move no longer exists', () => {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 1,
      currentPlayerID: 'p1',
      dreamMasterID: 'pM',
    });
    const G: SetupState = {
      ...base,
      players: {
        ...base.players,
        p1: makePlayer({
          id: 'p1',
          faction: 'thief',
          characterId: 'thief_forger' as CardID,
          hand: [KICK],
        }),
        p2: makePlayer({ id: 'p2', faction: 'thief', hand: [SHOOT] }),
      },
    };
    const res = applyMove(game, load(G), {
      playerID: 'p1',
      move: 'playForgerExchange',
      args: [{ targetID: 'p2', takenFromTarget: [SHOOT], returnedToTarget: [KICK] }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('unknown_move');
  });
});

describe('水星·航路追加的失败贿赂牌', () => {
  function poolFor(seed: string) {
    const s = createTestState({ rngSeed: seed });
    const withPool: SetupState = {
      ...s,
      bribePool: ['deal', 'deal', 'deal', 'fail', 'fail', 'fail'].map((kind, i) => ({
        id: `bribe-${i}`,
        kind: kind as 'deal' | 'fail',
        status: 'inPool' as const,
        heldBy: null,
        originalOwnerId: null,
      })),
    };
    return applyMercuryRouteExtraFailBribe(withPool, 'dm_mercury_route' as CardID).bribePool;
  }

  it('keeps a 3 deal + 4 fail pool numbered bribe-0..6', () => {
    const pool = poolFor('seed-a');
    expect(pool.map((b) => b.id)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => `bribe-${i}`));
    expect(pool.filter((b) => b.kind === 'deal')).toHaveLength(3);
    expect(pool.filter((b) => b.kind === 'fail')).toHaveLength(4);
  });

  it('does not pin the last-numbered bribe to fail across seeds', () => {
    const lastKinds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const pool = poolFor(`seed-${i}`);
      lastKinds.add(pool[pool.length - 1]!.kind);
    }
    expect(lastKinds.has('deal')).toBe(true);
    expect(lastKinds.has('fail')).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    expect(poolFor('same')).toEqual(poolFor('same'));
  });
});

describe('解封没有可响应者', () => {
  function unlockAlone(): SetupState {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 1,
      currentPlayerID: 'p1',
      dreamMasterID: 'pM',
    });
    const dead = (id: string) =>
      makePlayer({
        id,
        faction: id === 'pM' ? 'master' : 'thief',
        isAlive: false,
        deathTurn: 1,
      });
    return {
      ...base,
      deck: { cards: Array<CardID>(10).fill(KICK), discardPile: [] },
      players: {
        ...base.players,
        p1: makePlayer({ id: 'p1', faction: 'thief', currentLayer: 1 as Layer, hand: [UNLOCK] }),
        p2: dead('p2'),
        p3: dead('p3'),
        p4: dead('p4'),
        pM: dead('pM'),
      },
      layers: {
        ...base.layers,
        1: { ...base.layers[1]!, heartLockValue: 3, playersInLayer: ['p1'] },
      },
    };
  }

  it('resolves immediately and lets the turn continue', () => {
    const s = load(unlockAlone());
    const res = applyMove(game, s, { playerID: 'p1', move: 'playUnlock', args: [UNLOCK] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.pendingUnlock).toBeNull();
    expect(res.state.G.pendingResponseWindow).toBeNull();
    expect(res.state.G.layers[1]!.heartLockValue).toBe(2);
    const end = applyMove(game, res.state, { playerID: 'p1', move: 'endActionPhase', args: [] });
    expect(end.ok).toBe(true);
  });
});
