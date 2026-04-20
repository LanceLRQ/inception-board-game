// 空间女王·交错/造物 接入测试
// 对照：docs/manual/05-dream-thieves.md 空间女王

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';

function setupSpaceQueen() {
  let s = scenarioStartOfGame3p();
  s = {
    ...s,
    players: {
      ...s.players,
      p2: {
        ...s.players.p2!,
        characterId: 'thief_space_queen' as CardID,
        currentLayer: 1,
        hand: ['action_unlock' as CardID],
      },
      p1: {
        ...s.players.p1!,
        currentLayer: 1,
        hand: ['action_unlock' as CardID, 'action_shoot' as CardID],
      },
    },
    deck: {
      ...s.deck,
      cards: ['action_shift' as CardID, 'action_kick' as CardID, 'action_unlock' as CardID],
    },
    pendingUnlock: { playerID: 'p1', layer: 1, cardId: 'action_unlock' as CardID },
  };
  return s;
}

describe('空间女王·交错（resolveUnlock hook）', () => {
  it('p1 解锁成功 → p2（空间女王）自动抽 1', () => {
    let s = setupSpaceQueen();
    s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
    const before = s.players.p2!.hand.length;
    const r = callMove(s, 'resolveUnlock', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p2!.hand.length).toBe(before + 1);
  });

  it('p1 解锁成功 → 非 space_queen 角色不抽牌', () => {
    let s = setupSpaceQueen();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: { ...s.players, p2: { ...s.players.p2!, characterId: 'thief_architect' as CardID } },
    };
    const before = s.players.p2!.hand.length;
    const r = callMove(s, 'resolveUnlock', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p2!.hand.length).toBe(before);
  });

  it('空间女王已死亡 → 不触发', () => {
    let s = setupSpaceQueen();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: { ...s.players, p2: { ...s.players.p2!, isAlive: false } },
    };
    const before = s.players.p2!.hand.length;
    const r = callMove(s, 'resolveUnlock', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p2!.hand.length).toBe(before);
  });
});

describe('空间女王·造物（useSpaceQueenStashTop）', () => {
  it('弃牌阶段放 1 手牌到牌库顶', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'discard',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          characterId: 'thief_space_queen' as CardID,
          hand: ['action_unlock' as CardID, 'action_shoot' as CardID],
        },
      },
      deck: { ...s.deck, cards: ['action_kick' as CardID] },
    };
    const r = callMove(s, 'useSpaceQueenStashTop', ['action_unlock'], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p1!.hand).not.toContain('action_unlock');
    expect(r.deck.cards[0]).toBe('action_unlock');
  });

  it('非空间女王角色 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'discard',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, hand: ['action_unlock' as CardID] },
      },
    };
    const r = callMove(s, 'useSpaceQueenStashTop', ['action_unlock'], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非 discard 阶段 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          characterId: 'thief_space_queen' as CardID,
          hand: ['action_unlock' as CardID],
        },
      },
    };
    const r = callMove(s, 'useSpaceQueenStashTop', ['action_unlock'], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });
});
