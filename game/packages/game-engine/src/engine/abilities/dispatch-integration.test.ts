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

  // R28 · 白羊实际多抽（接入响应/触发批次 · ariesExtraDraw.apply 调用 drawCards）
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
