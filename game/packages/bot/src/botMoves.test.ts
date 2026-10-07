// Bot 选 move 与参数构造测试（面向对局状态的纯函数）

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from '@icgame/game-engine/setup';
import { HAND_LIMIT } from '@icgame/game-engine/config';
import { createTestState, makePlayer } from '@icgame/game-engine/testing/fixtures';
import { legalMovesFor, MOVES_BY_PHASE, MOVE_PRIORITY } from './moveTables.js';
import { pickBotMove, defaultArgsFor } from './botMoves.js';

/** 构造 0..4 号玩家（4 号为梦主）的对局状态，可指定各自手牌 */
function makeState(
  overrides: Partial<SetupState> = {},
  hands: Record<string, string[]> = {},
): SetupState {
  const players: SetupState['players'] = {};
  for (const id of ['0', '1', '2', '3', '4']) {
    players[id] = makePlayer({
      id,
      nickname: id,
      faction: id === '4' ? 'master' : 'thief',
      hand: (hands[id] ?? []) as CardID[],
    });
  }
  return createTestState({
    phase: 'playing',
    turnPhase: 'action',
    players,
    playerOrder: ['0', '1', '2', '3', '4'],
    currentPlayerID: '1',
    dreamMasterID: '4',
    ...overrides,
  });
}

/** 让 2 号成为巨蟹，并与指定玩家一起放在第 1 层（庇佑生效） */
function withCancerInLayer(G: SetupState, playerID: string): SetupState {
  const cancer = G.players['2']!;
  const layer1 = G.layers[1]!;
  return {
    ...G,
    players: {
      ...G.players,
      '2': { ...cancer, characterId: 'thief_cancer' as CardID, currentLayer: 1 },
      [playerID]: { ...G.players[playerID]!, currentLayer: 1 },
    },
    layers: { ...G.layers, 1: { ...layer1, playersInLayer: [playerID, '2'] } },
  };
}

const cards = (n: number, prefix = 'c'): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('legalMovesFor', () => {
  it('returns only completeSetup during setup phase', () => {
    expect(legalMovesFor('setup', 'turnStart')).toEqual(['completeSetup']);
    expect(legalMovesFor('setup', 'action')).toEqual(['completeSetup']);
  });

  it('returns the whitelist of the current turn phase', () => {
    expect(legalMovesFor('playing', 'draw')).toBe(MOVES_BY_PHASE.draw);
    expect(legalMovesFor('playing', 'action')).toBe(MOVES_BY_PHASE.action);
    expect(legalMovesFor('playing', 'discard')).toEqual([
      'doDiscard',
      'skipDiscard',
      'useSpaceQueenStashTop',
    ]);
  });

  it('returns empty array for unknown turn phase or missing phase', () => {
    expect(legalMovesFor('playing', 'turnEnd')).toEqual([]);
    expect(legalMovesFor('playing', 'nonsense')).toEqual([]);
    expect(legalMovesFor(null, 'nonsense')).toEqual([]);
    expect(legalMovesFor('playing', '')).toEqual([]);
  });
});

describe('MOVE_PRIORITY', () => {
  it('keeps pending-resolution moves at highest priority', () => {
    for (const m of [
      'resolveGraft',
      'resolveGravityPick',
      'resolveShootMove',
      'resolveSudgerPick',
    ]) {
      expect(MOVE_PRIORITY[m]).toBe(0);
    }
    expect(MOVE_PRIORITY.endActionPhase).toBe(1);
    expect(MOVE_PRIORITY.playShoot).toBe(90);
    expect(MOVE_PRIORITY.playRevive).toBe(50);
  });
});

describe('pickBotMove', () => {
  it('picks doDraw in draw phase', () => {
    const G = makeState({ turnPhase: 'draw' });
    expect(pickBotMove(G, '1', legalMovesFor('playing', 'draw'))).toBe('doDraw');
  });

  it('picks endActionPhase in action phase', () => {
    const G = makeState({ turnPhase: 'action' });
    expect(pickBotMove(G, '1', legalMovesFor('playing', 'action'))).toBe('endActionPhase');
  });

  it('picks doDiscard when hand exceeds the limit, skipDiscard otherwise', () => {
    const legal = legalMovesFor('playing', 'discard');
    const over = makeState({ turnPhase: 'discard' }, { '1': cards(HAND_LIMIT + 1) });
    expect(pickBotMove(over, '1', legal)).toBe('doDiscard');
    const atLimit = makeState({ turnPhase: 'discard' }, { '1': cards(HAND_LIMIT) });
    expect(pickBotMove(atLimit, '1', legal)).toBe('skipDiscard');
  });

  it('does not discard when sheltered by a living Cancer in the same layer', () => {
    const legal = legalMovesFor('playing', 'discard');
    const G = makeState({ turnPhase: 'discard' }, { '1': cards(HAND_LIMIT + 3) });
    const sheltered = withCancerInLayer(G, '1');
    expect(pickBotMove(sheltered, '1', legal)).toBe('skipDiscard');
    // 巨蟹死亡后庇佑消失，照常弃牌
    const cancer = sheltered.players['2']!;
    const dead = {
      ...sheltered,
      players: { ...sheltered.players, '2': { ...cancer, isAlive: false } },
    };
    expect(pickBotMove(dead, '1', legal)).toBe('doDiscard');
  });

  it('discards the whole hand under the Joker penalty even below the limit', () => {
    const legal = legalMovesFor('playing', 'discard');
    const G = makeState({ turnPhase: 'discard' }, { '1': cards(3) });
    const joker = G.players['1']!;
    const armed = {
      ...G,
      players: { ...G.players, '1': { ...joker, forcedDiscardArmedAtTurn: G.turnNumber } },
    };
    expect(pickBotMove(armed, '1', legal)).toBe('doDiscard');
    expect(defaultArgsFor('doDiscard', armed, '1')).toEqual([armed.players['1']!.hand]);
  });

  it('picks resolveGraft when the bot owns the pending graft', () => {
    const legal = legalMovesFor('playing', 'action');
    const mine = makeState({ pendingGraft: { playerID: '2' } });
    expect(pickBotMove(mine, '2', legal)).toBe('resolveGraft');
    const others = makeState({ pendingGraft: { playerID: '3' } });
    expect(pickBotMove(others, '2', legal)).toBe('endActionPhase');
  });

  it('picks resolveGravityPick when it is the bonder turn to pick', () => {
    const legal = legalMovesFor('playing', 'action');
    const G = makeState({
      pendingGravity: {
        bonderPlayerID: '2',
        targetIds: ['3'],
        pool: ['a', 'b'] as CardID[],
        pickOrder: ['2', '3'],
        pickCursor: 0,
      },
    });
    expect(pickBotMove(G, '2', legal)).toBe('resolveGravityPick');
    expect(pickBotMove(G, '3', legal)).toBe('endActionPhase');
  });

  it('picks resolveSudgerPick only for the current player', () => {
    const legal = legalMovesFor('playing', 'action');
    const G = makeState({
      currentPlayerID: '2',
      pendingSudgerRolls: {
        rollA: 1,
        rollB: 2,
        targetPlayerID: '3',
        cardId: 'x' as CardID,
        deathFaces: [],
        moveFaces: [],
        extraOnMove: null,
      },
    });
    expect(pickBotMove(G, '2', legal)).toBe('resolveSudgerPick');
    expect(pickBotMove(G, '3', legal)).toBe('endActionPhase');
  });

  it('picks resolveShootMove when the bot is the shooter with a pending move', () => {
    const legal = legalMovesFor('playing', 'action');
    const G = makeState({
      pendingShootMove: {
        shooterID: '2',
        targetPlayerID: '3',
        cardId: 'x' as CardID,
        extraOnMove: null,
        choices: [1, 3],
      },
    });
    expect(pickBotMove(G, '2', legal)).toBe('resolveShootMove');
    expect(pickBotMove(G, '1', legal)).toBe('endActionPhase');
  });

  it('does not pick libra moves itself (autoAction settles libra before pickBotMove runs)', () => {
    const legal = legalMovesFor('playing', 'action');
    const pending = makeState({
      pendingLibra: { bonderPlayerID: '2', targetPlayerID: '3', split: null },
    });
    expect(pickBotMove(pending, '2', legal)).toBe('endActionPhase');
  });

  it('never picks pending-only moves without a pending state', () => {
    const G = makeState();
    const legal = ['resolveGraft', 'resolveLibraSplit', 'resolveShootMove', 'playShoot'];
    expect(pickBotMove(G, '1', legal)).toBe('playShoot');
    expect(pickBotMove(G, '1', ['resolveGraft', 'resolveLibraPick'])).toBeNull();
  });

  it('ranks unknown moves at 99 and returns lowest priority number first', () => {
    const G = makeState();
    expect(pickBotMove(G, '1', ['mysteryMove', 'playShoot'])).toBe('playShoot');
    expect(pickBotMove(G, '1', ['mysteryMove'])).toBe('mysteryMove');
  });

  it('returns null for an empty move list', () => {
    expect(pickBotMove(makeState(), '1', [])).toBeNull();
  });
});

describe('defaultArgsFor', () => {
  it('doDiscard returns exactly the overflow count from the front of the hand', () => {
    const hand = cards(HAND_LIMIT + 2);
    const G = makeState({}, { '1': hand });
    expect(defaultArgsFor('doDiscard', G, '1')).toEqual([hand.slice(0, 2)]);
    const noOverflow = makeState({}, { '1': cards(3) });
    expect(defaultArgsFor('doDiscard', noOverflow, '1')).toEqual([[]]);
  });

  it('doDiscard discards nothing when sheltered by Cancer', () => {
    const G = withCancerInLayer(makeState({}, { '1': cards(HAND_LIMIT + 2) }), '1');
    expect(defaultArgsFor('doDiscard', G, '1')).toEqual([[]]);
  });

  it('dreamMasterMove steps one layer deeper, clamped to 1..4', () => {
    const at = (layer: number): SetupState =>
      makeState({ players: { '1': makePlayer({ id: '1', currentLayer: layer as never }) } });
    expect(defaultArgsFor('dreamMasterMove', at(1), '1')).toEqual([2]);
    expect(defaultArgsFor('dreamMasterMove', at(4), '1')).toEqual([4]);
  });

  it('resolveGraft returns the first 2 cards of the hand', () => {
    const G = makeState({}, { '1': ['a', 'b', 'c', 'd'] });
    expect(defaultArgsFor('resolveGraft', G, '1')).toEqual([['a', 'b']]);
  });

  it('resolveGravityPick returns the first card of the pool', () => {
    const G = makeState({
      pendingGravity: {
        bonderPlayerID: '1',
        targetIds: ['2'],
        pool: ['x', 'y'] as CardID[],
        pickOrder: ['1', '2'],
        pickCursor: 0,
      },
    });
    expect(defaultArgsFor('resolveGravityPick', G, '1')).toEqual(['x']);
  });

  it('resolveSudgerPick picks the larger roll, A on tie, A when no pending', () => {
    const withRolls = (rollA: number, rollB: number): SetupState =>
      makeState({
        pendingSudgerRolls: {
          rollA,
          rollB,
          targetPlayerID: '3',
          cardId: 'x' as CardID,
          deathFaces: [],
          moveFaces: [],
          extraOnMove: null,
        },
      });
    expect(defaultArgsFor('resolveSudgerPick', withRolls(1, 5), '1')).toEqual(['B']);
    expect(defaultArgsFor('resolveSudgerPick', withRolls(6, 2), '1')).toEqual(['A']);
    expect(defaultArgsFor('resolveSudgerPick', withRolls(3, 3), '1')).toEqual(['A']);
    expect(defaultArgsFor('resolveSudgerPick', makeState(), '1')).toEqual(['A']);
  });

  it('resolveShootMove picks the first choice, falling back to 1', () => {
    const withChoices = (choices: number[]): SetupState =>
      makeState({
        pendingShootMove: {
          shooterID: '1',
          targetPlayerID: '3',
          cardId: 'x' as CardID,
          extraOnMove: null,
          choices,
        },
      });
    expect(defaultArgsFor('resolveShootMove', withChoices([3, 1]), '1')).toEqual([3]);
    expect(defaultArgsFor('resolveShootMove', withChoices([]), '1')).toEqual([1]);
    expect(defaultArgsFor('resolveShootMove', makeState(), '1')).toEqual([1]);
  });

  it('resolveLibraSplit splits the TARGET hand by index parity', () => {
    const G = makeState(
      { pendingLibra: { bonderPlayerID: '2', targetPlayerID: '3', split: null } },
      { '2': ['b0', 'b1'], '3': ['t0', 't1', 't2', 't3', 't4'] },
    );
    expect(defaultArgsFor('resolveLibraSplit', G, '2')).toEqual([
      ['t0', 't2', 't4'],
      ['t1', 't3'],
    ]);
  });

  it('resolveLibraSplit yields two empty piles when there is no pending libra', () => {
    expect(defaultArgsFor('resolveLibraSplit', makeState(), '2')).toEqual([[], []]);
  });

  it('resolveLibraPick picks the larger pile, pile1 on tie or without split', () => {
    const withSplit = (p1: string[], p2: string[]): SetupState =>
      makeState({
        pendingLibra: {
          bonderPlayerID: '2',
          targetPlayerID: '3',
          split: { pile1: p1 as CardID[], pile2: p2 as CardID[] },
        },
      });
    expect(defaultArgsFor('resolveLibraPick', withSplit(['a'], ['b', 'c']), '2')).toEqual([
      'pile2',
    ]);
    expect(defaultArgsFor('resolveLibraPick', withSplit(['a', 'b'], ['c']), '2')).toEqual([
      'pile1',
    ]);
    expect(defaultArgsFor('resolveLibraPick', withSplit(['a'], ['b']), '2')).toEqual(['pile1']);
    expect(defaultArgsFor('resolveLibraPick', makeState(), '2')).toEqual(['pile1']);
  });

  it('returns an empty array for unregistered moves', () => {
    expect(defaultArgsFor('playShoot', makeState(), '1')).toEqual([]);
    expect(defaultArgsFor('whatever', makeState(), '1')).toEqual([]);
  });
});
