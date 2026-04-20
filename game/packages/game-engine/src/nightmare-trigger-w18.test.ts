// W18-A 梦魇自动触发检测 + 未翻开梦魇直接弃掉
// 对照：plans/tasks.md Phase 3 W18 梦魇触发时机集成

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  findCoinVaultsWithHiddenNightmare,
  applyDiscardHiddenNightmare,
  findMasterID,
} from './engine/skills.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { scenarioStartOfGame3p } from './testing/scenarios.js';

function setLayerNightmare(
  state: SetupState,
  layer: Layer,
  nid: CardID | null,
  revealed = false,
  triggered = false,
): SetupState {
  const li = state.layers[layer]!;
  return {
    ...state,
    layers: {
      ...state.layers,
      [layer]: {
        ...li,
        nightmareId: nid,
        nightmareRevealed: revealed,
        nightmareTriggered: triggered,
      },
    },
  };
}

function openVault(state: SetupState, layer: Layer, contentType: 'coin' | 'secret'): SetupState {
  const idx = state.vaults.findIndex((v) => v.layer === layer && v.contentType === contentType);
  if (idx === -1) return state;
  return {
    ...state,
    vaults: state.vaults.map((v, i) => (i === idx ? { ...v, isOpened: true, openedBy: 'p1' } : v)),
  };
}

function setActionPhasePM(state: SetupState): SetupState {
  return { ...state, turnPhase: 'action', currentPlayerID: 'pM' };
}

describe('W18-A · findCoinVaultsWithHiddenNightmare', () => {
  it('金币金库已开 + 同层有未翻开梦魇 → 命中', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_despair_storm');
    s = openVault(s, 2 as Layer, 'coin');
    expect(findCoinVaultsWithHiddenNightmare(s)).toEqual([2]);
  });

  it('秘密金库被打开 → 不命中', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm');
    s = openVault(s, 1 as Layer, 'secret');
    expect(findCoinVaultsWithHiddenNightmare(s)).toEqual([]);
  });

  it('梦魇已翻开 → 不命中', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm', true);
    s = openVault(s, 1 as Layer, 'coin');
    expect(findCoinVaultsWithHiddenNightmare(s)).toEqual([]);
  });

  it('梦魇已触发过 → 不命中', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 1 as Layer, null, false, true);
    s = openVault(s, 1 as Layer, 'coin');
    expect(findCoinVaultsWithHiddenNightmare(s)).toEqual([]);
  });

  it('该层没梦魇 → 不命中', () => {
    let s = scenarioStartOfGame3p();
    s = openVault(s, 1 as Layer, 'coin');
    expect(findCoinVaultsWithHiddenNightmare(s)).toEqual([]);
  });

  it('多层同时命中 → 全部返回', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_despair_storm');
    s = setLayerNightmare(s, 3 as Layer, 'nightmare_hunger_bite');
    s = openVault(s, 2 as Layer, 'coin');
    s = openVault(s, 3 as Layer, 'coin');
    const result = findCoinVaultsWithHiddenNightmare(s);
    expect(result.sort()).toEqual([2, 3]);
  });

  it('金库未打开 → 不命中', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm');
    expect(findCoinVaultsWithHiddenNightmare(s)).toEqual([]);
  });
});

describe('W18-A · applyDiscardHiddenNightmare', () => {
  it('弃掉未翻开梦魇 + 标记已触发', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm');
    const r = applyDiscardHiddenNightmare(s, 1);
    expect(r).not.toBeNull();
    expect(r!.layers[1]!.nightmareId).toBe(null);
    expect(r!.layers[1]!.nightmareTriggered).toBe(true);
    expect(r!.usedNightmareIds).toContain('nightmare_despair_storm');
  });

  it('已翻开梦魇 → null（应走 masterDiscardNightmare）', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm', true);
    const r = applyDiscardHiddenNightmare(s, 1);
    expect(r).toBeNull();
  });

  it('该层没梦魇 → null', () => {
    const s = scenarioStartOfGame3p();
    const r = applyDiscardHiddenNightmare(s, 1);
    expect(r).toBeNull();
  });

  it('不影响其它层梦魇', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm');
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_hunger_bite');
    const r = applyDiscardHiddenNightmare(s, 1)!;
    expect(r.layers[2]!.nightmareId).toBe('nightmare_hunger_bite');
  });
});

describe('W18-A · move masterDiscardHiddenNightmare', () => {
  it('梦主弃未翻开梦魇 → 成功', () => {
    let s = scenarioStartOfGame3p();
    s = setActionPhasePM(s);
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm');
    const r = callMove(s, 'masterDiscardHiddenNightmare', [1], { currentPlayer: 'pM' });
    expectMoveOk(r);
    expect(r.layers[1]!.nightmareId).toBe(null);
  });

  it('非梦主调用 → INVALID', () => {
    let s = scenarioStartOfGame3p();
    s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm');
    const r = callMove(s, 'masterDiscardHiddenNightmare', [1], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('已翻开梦魇 → INVALID', () => {
    let s = scenarioStartOfGame3p();
    s = setActionPhasePM(s);
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm', true);
    const r = callMove(s, 'masterDiscardHiddenNightmare', [1], { currentPlayer: 'pM' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非 action 阶段 → INVALID', () => {
    let s = scenarioStartOfGame3p();
    s = { ...s, turnPhase: 'draw', currentPlayerID: 'pM' };
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm');
    const r = callMove(s, 'masterDiscardHiddenNightmare', [1], { currentPlayer: 'pM' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('该层没梦魇 → INVALID', () => {
    let s = scenarioStartOfGame3p();
    s = setActionPhasePM(s);
    const r = callMove(s, 'masterDiscardHiddenNightmare', [1], { currentPlayer: 'pM' });
    expect(r).toBe('INVALID_MOVE');
  });
});

describe('W18-A · 端到端：开金币金库 → 检测 → 弃梦魇', () => {
  it('盗梦者打开金币金库后，梦主能检测并弃掉同层未翻开梦魇', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_despair_storm');
    s = openVault(s, 2 as Layer, 'coin');
    // 检测
    expect(findCoinVaultsWithHiddenNightmare(s)).toEqual([2]);
    // 梦主弃
    s = setActionPhasePM(s);
    const r = callMove(s, 'masterDiscardHiddenNightmare', [2], { currentPlayer: 'pM' });
    expectMoveOk(r);
    // 弃完后不再命中
    expect(findCoinVaultsWithHiddenNightmare(r)).toEqual([]);
  });

  it('findMasterID + 检测的组合调用（用于 UI 决策）', () => {
    let s = scenarioStartOfGame3p();
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_hunger_bite');
    s = openVault(s, 2 as Layer, 'coin');
    expect(findMasterID(s)).toBe('pM');
    expect(findCoinVaultsWithHiddenNightmare(s)).toEqual([2]);
  });
});
