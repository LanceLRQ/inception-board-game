// 盛夏·充盈 + 世界观 抽牌接入测试
// 对照：docs/manual/06-dream-master.md 盛夏

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';

function setupMidsummer() {
  let s = scenarioStartOfGame3p();
  s = {
    ...s,
    turnPhase: 'draw',
    currentPlayerID: 'p1',
    players: {
      ...s.players,
      p1: {
        ...s.players.p1!,
        currentLayer: 1,
        hand: [],
        faction: 'thief',
      },
      pM: {
        ...s.players.pM!,
        characterId: 'dm_midsummer' as CardID,
        currentLayer: 1,
      },
    },
    deck: {
      ...s.deck,
      cards: Array.from({ length: 10 }, (_, i) => `action_card_${i}` as CardID),
    },
  };
  return s;
}

describe('盛夏·世界观（盗梦者抽牌+1）', () => {
  it('盗梦者 doDraw 多抽 1 张（BASE=2 +1=3）', () => {
    const s = setupMidsummer();
    const before = s.players.p1!.hand.length;
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p1!.hand.length).toBe(before + 3);
  });

  it('梦主非盛夏 → 正常抽（BASE=2）', () => {
    let s = setupMidsummer();
    s = {
      ...s,
      players: { ...s.players, pM: { ...s.players.pM!, characterId: 'dm_architect' as CardID } },
    };
    const before = s.players.p1!.hand.length;
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p1!.hand.length).toBe(before + 2);
  });
});

describe('盛夏·充盈（梦主多抽=未派发贿赂数）', () => {
  it('梦主 doDraw + 3 张贿赂 → BASE=2+3=5 张', () => {
    let s = setupMidsummer();
    s = {
      ...s,
      currentPlayerID: 'pM',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, hand: [] },
        pM: { ...s.players.pM!, hand: [], faction: 'master' },
      },
      bribePool: [
        { id: 'bribe-1', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'bribe-2', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'bribe-3', status: 'inPool', heldBy: null, originalOwnerId: null },
      ],
    };
    const before = s.players.pM!.hand.length;
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'pM' });
    expectMoveOk(r);
    expect(r.players.pM!.hand.length).toBe(before + 5);
  });

  it('梦主无未派发贿赂 → 正常抽（BASE=2）', () => {
    let s = setupMidsummer();
    s = {
      ...s,
      currentPlayerID: 'pM',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, hand: [] },
        pM: { ...s.players.pM!, hand: [], faction: 'master' },
      },
      bribePool: [],
    };
    const before = s.players.pM!.hand.length;
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'pM' });
    expectMoveOk(r);
    expect(r.players.pM!.hand.length).toBe(before + 2);
  });
});
