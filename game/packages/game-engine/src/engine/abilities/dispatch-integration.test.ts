// W10-R5 · dispatcher → game.ts 接入冒烟测试
// 验证 doDraw / resolveUnlock 调用 dispatchPassives 后主流程保持正常

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from '../../setup.js';
import { callMove, expectMoveOk } from '../../testing/fixtures.js';
import { scenarioStartOfGame3p } from '../../testing/scenarios.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setUsedNightmares(state: SetupState, ids: string[]): SetupState {
  return { ...state, usedNightmareIds: ids as CardID[] };
}

describe('dispatcher 接入 · doDraw', () => {
  it('白羊 + 已弃梦魇 → doDraw 正常完成（不破坏主流程）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    s = setUsedNightmares(s, ['nightmare_despair_storm']);
    s = { ...s, deck: { ...s.deck, cards: Array(10).fill('action_unlock') as CardID[] } };
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.turnPhase).toBe('action');
  });

  it('非白羊角色 → doDraw 不受影响', () => {
    const s = {
      ...scenarioStartOfGame3p(),
      deck: {
        ...scenarioStartOfGame3p().deck,
        cards: Array(10).fill('action_unlock') as CardID[],
      },
    };
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.turnPhase).toBe('action');
    expect(r.players['p1']!.hand.length).toBeGreaterThan(0);
  });
});

describe('dispatcher 接入 · resolveUnlock', () => {
  it('空间女王 pendingUnlock → resolveUnlock 正常完成', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p2', 'thief_space_queen');
    s = {
      ...s,
      turnPhase: 'action',
      pendingUnlock: {
        playerID: 'p1',
        layer: 1,
        cardId: 'action_unlock' as CardID,
      },
    };
    const r = callMove(s, 'resolveUnlock', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.pendingUnlock).toBeNull();
  });
});
