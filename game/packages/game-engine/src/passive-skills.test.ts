// 白羊·弃梦魇加成 / 空间女王·监察：经真实 move 触发的行为测试
// 对照：docs/manual/05-dream-thieves.md 白羊、空间女王

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { settleAriesExtraDraw, settleSpaceQueenObserve } from './engine/skills.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setUsedNightmares(state: SetupState, ids: string[]): SetupState {
  return { ...state, usedNightmareIds: ids as CardID[] };
}

describe('白羊 · doDraw 额外抽牌', () => {
  it('白羊 + 已弃梦魇 → doDraw 正常完成并进入行动阶段', () => {
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

  it('白羊 · 1 张已弃梦魇 → 比标准多抽 1 张', () => {
    let base = scenarioStartOfGame3p();
    base = { ...base, deck: { ...base.deck, cards: Array(20).fill('action_unlock') as CardID[] } };
    // 基线：普通盗梦者（非白羊）走一遍 doDraw
    const baseline = callMove(base, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(baseline);
    const baselineHand = baseline.players['p1']!.hand.length;

    // 白羊 + 1 张已弃梦魇
    let s = setCharacter(base, 'p1', 'thief_aries');
    s = setUsedNightmares(s, ['nightmare_despair_storm']);
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players['p1']!.hand.length).toBe(baselineHand + 1);
  });

  it('白羊 · 3 张已弃梦魇 → 比标准多抽 3 张', () => {
    let base = scenarioStartOfGame3p();
    base = { ...base, deck: { ...base.deck, cards: Array(20).fill('action_unlock') as CardID[] } };
    const baseline = callMove(base, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(baseline);
    const baselineHand = baseline.players['p1']!.hand.length;

    let s = setCharacter(base, 'p1', 'thief_aries');
    s = setUsedNightmares(s, [
      'nightmare_despair_storm',
      'nightmare_hunger_bite',
      'nightmare_fatal_whirl',
    ]);
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players['p1']!.hand.length).toBe(baselineHand + 3);
  });

  it('白羊 · 已弃梦魇 = 0 → 无多抽（与标准一致）', () => {
    let base = scenarioStartOfGame3p();
    base = { ...base, deck: { ...base.deck, cards: Array(20).fill('action_unlock') as CardID[] } };
    const baseline = callMove(base, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(baseline);

    const s = setCharacter(base, 'p1', 'thief_aries');
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players['p1']!.hand.length).toBe(baseline.players['p1']!.hand.length);
  });

  it('白羊不是 currentPlayer → 其他玩家抽牌时不触发多抽（guard invokerID === currentPlayerID）', () => {
    let base = scenarioStartOfGame3p();
    base = { ...base, deck: { ...base.deck, cards: Array(20).fill('action_unlock') as CardID[] } };
    // p2 是当前玩家（非白羊），p1 是白羊但不在当前回合
    let s = setCharacter(base, 'p1', 'thief_aries');
    s = setUsedNightmares(s, ['nightmare_despair_storm', 'nightmare_hunger_bite']);
    s = { ...s, currentPlayerID: 'p2' };
    const p1HandBefore = s.players['p1']!.hand.length;
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p2' });
    expectMoveOk(r);
    // p1（白羊）手牌不变：passive 不在非自己回合触发
    expect(r.players['p1']!.hand.length).toBe(p1HandBefore);
    // p2 正常抽（非白羊无加成）
    expect(r.players['p2']!.hand.length).toBeGreaterThan(0);
  });
});

describe('空间女王 · 解封成功后抽 1', () => {
  function unlockScene(queenID: string | null): SetupState {
    let s = scenarioStartOfGame3p();
    if (queenID) s = setCharacter(s, queenID, 'thief_space_queen');
    return {
      ...s,
      turnPhase: 'action',
      deck: { ...s.deck, cards: Array(10).fill('action_unlock') as CardID[] },
      pendingUnlock: { playerID: 'p1', layer: 1, cardId: 'action_unlock' as CardID },
    };
  }

  it('空间女王在场 → resolveUnlock 后比无女王时多抽 1 张', () => {
    const baseline = callMove(unlockScene(null), 'resolveUnlock', [], { currentPlayer: 'p1' });
    expectMoveOk(baseline);
    const r = callMove(unlockScene('p2'), 'resolveUnlock', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.pendingUnlock).toBeNull();
    expect(r.players['p2']!.hand.length).toBe(baseline.players['p2']!.hand.length + 1);
    expect(r.deck.cards.length).toBe(baseline.deck.cards.length - 1);
  });

  it('没有空间女王 → resolveUnlock 不额外抽牌', () => {
    const r = callMove(unlockScene(null), 'resolveUnlock', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.pendingUnlock).toBeNull();
  });
});

describe('settleAriesExtraDraw', () => {
  function ariesScene(nightmares: number): SetupState {
    let s = setCharacter(scenarioStartOfGame3p(), 'p1', 'thief_aries');
    s = setUsedNightmares(
      s,
      ['nightmare_despair_storm', 'nightmare_hunger_bite'].slice(0, nightmares),
    );
    return {
      ...s,
      currentPlayerID: 'p1',
      deck: { ...s.deck, cards: Array(10).fill('action_unlock') as CardID[] },
    };
  }

  it('当前回合的白羊按已弃梦魇数额外抽牌', () => {
    const s = ariesScene(2);
    const next = settleAriesExtraDraw(s);
    expect(next.players['p1']!.hand.length).toBe(s.players['p1']!.hand.length + 2);
    expect(next.deck.cards.length).toBe(s.deck.cards.length - 2);
  });

  it('没有已弃梦魇 → 原样返回', () => {
    const s = ariesScene(0);
    expect(settleAriesExtraDraw(s)).toBe(s);
  });

  it('白羊已死亡 → 不抽', () => {
    let s = ariesScene(2);
    s = { ...s, players: { ...s.players, p1: { ...s.players['p1']!, isAlive: false } } };
    expect(settleAriesExtraDraw(s)).toBe(s);
  });
});

describe('settleSpaceQueenObserve', () => {
  it('存活的空间女王抽 1，其他人不受影响', () => {
    let s = setCharacter(scenarioStartOfGame3p(), 'p2', 'thief_space_queen');
    s = { ...s, deck: { ...s.deck, cards: Array(5).fill('action_unlock') as CardID[] } };
    const next = settleSpaceQueenObserve(s);
    expect(next.players['p2']!.hand.length).toBe(s.players['p2']!.hand.length + 1);
    expect(next.players['p1']!.hand.length).toBe(s.players['p1']!.hand.length);
    expect(next.players['pM']!.hand.length).toBe(s.players['pM']!.hand.length);
  });

  it('空间女王已死亡 → 不抽', () => {
    let s = setCharacter(scenarioStartOfGame3p(), 'p2', 'thief_space_queen');
    s = { ...s, players: { ...s.players, p2: { ...s.players['p2']!, isAlive: false } } };
    expect(settleSpaceQueenObserve(s)).toBe(s);
  });
});
