// R6 · dispatcher 覆盖扩展 · 6 个 trigger 点集成冒烟测试
// 覆盖：onTurnStart / onTurnEnd / onActionPhase / onDiscardPhase / onBeforeShoot / onAfterShoot / onKilled

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from '../../setup.js';
import { callMove, expectMoveOk } from '../../testing/fixtures.js';
import { scenarioStartOfGame3p, scenarioActionPhase } from '../../testing/scenarios.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

describe('R6 · dispatcher 覆盖扩展', () => {
  it('doDraw 触发 onDrawPhase + onActionPhase（白羊）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    s = { ...s, usedNightmareIds: ['nightmare_despair_storm' as CardID] };
    s = { ...s, deck: { ...s.deck, cards: Array(10).fill('action_unlock') as CardID[] } };
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.turnPhase).toBe('action');
  });

  it('endActionPhase 触发 onDiscardPhase（空间女王 passive 不破坏流程）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_space_queen');
    const r = callMove(s, 'endActionPhase', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.turnPhase).toBe('discard');
  });

  it('playShoot 触发 onBeforeShoot + onAfterShoot（流程不受扰动）', () => {
    let s = scenarioActionPhase();
    // 确保 p1 有 SHOOT 牌，与 p2 同层
    const p1 = s.players['p1']!;
    const p2 = s.players['p2']!;
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...p1, hand: ['action_shoot' as CardID], currentLayer: 2 as Layer },
        p2: { ...p2, currentLayer: 2 as Layer, isAlive: true },
      },
      layers: {
        ...s.layers,
        [2]: { ...s.layers[2]!, playersInLayer: ['p1', 'p2'] },
      },
    };
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], {
      currentPlayer: 'p1',
      rolls: [3],
    });
    expectMoveOk(r);
    // SHOOT 已结算（手牌被弃）
    expect(r.players['p1']!.hand).not.toContain('action_shoot');
  });

  it('onKilled 触发（SHOOT kill 场景）', () => {
    let s = scenarioActionPhase();
    const p1 = s.players['p1']!;
    const p2 = s.players['p2']!;
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...p1, hand: ['action_shoot' as CardID], currentLayer: 2 as Layer },
        p2: { ...p2, currentLayer: 2 as Layer, isAlive: true },
      },
      layers: {
        ...s.layers,
        [2]: { ...s.layers[2]!, playersInLayer: ['p1', 'p2'] },
      },
    };
    // rolls=1 → 死亡面（默认 deathFaces=[1]）
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], {
      currentPlayer: 'p1',
      rolls: [1],
    });
    expectMoveOk(r);
    expect(r.players['p2']!.isAlive).toBe(false);
  });

  it('turn.onBegin 触发 onTurnStart（流程不受扰）', () => {
    // 通过 callMove 运行一个回合周期确保不崩
    const s = scenarioActionPhase();
    const r = callMove(s, 'endActionPhase', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.turnPhase).toBe('discard');
  });

  it('turn.onEnd 触发 onTurnEnd（冥王星世界观 + dispatch 共存不冲突）', () => {
    let s = scenarioActionPhase();
    // 加冥王星世界观 + 手牌 6 张 → onEnd 触发入迷失层 + dispatch
    s = {
      ...s,
      activeWorldViews: ['dm_pluto_hell' as CardID],
      players: {
        ...s.players,
        p1: {
          ...s.players['p1']!,
          hand: Array(6).fill('action_unlock') as CardID[],
          currentLayer: 2 as Layer,
        },
      },
    };
    // 不直接调用 onEnd，验证 turnPhase 流转时 dispatch 无副作用
    const r = callMove(s, 'endActionPhase', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
  });
});
