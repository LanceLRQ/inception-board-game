// 梦主梦魇决策提示纯逻辑测试

import { describe, it, expect } from 'vitest';
import { computeNightmareDecisionState } from './logic.js';
import { scenarioStartOfGame3p, type SetupState } from '@icgame/game-engine';

/** 构造一个金币金库已开 + 同层未翻开梦魇的场景 */
function withCoinVaultAndHiddenNightmare(s: SetupState, layer: 0 | 1 | 2 | 3 | 4): SetupState {
  const ls = s.layers[layer]!;
  const vIdx = s.vaults.findIndex((v) => v.layer === layer && v.contentType === 'coin');
  return {
    ...s,
    layers: {
      ...s.layers,
      [layer]: {
        ...ls,
        nightmareId: 'nightmare_despair_storm',
        nightmareRevealed: false,
        nightmareTriggered: false,
      },
    },
    vaults:
      vIdx >= 0
        ? s.vaults.map((v, i) => (i === vIdx ? { ...v, isOpened: true, openedBy: 'p1' } : v))
        : s.vaults,
  };
}

/** 确保状态处于 action 阶段 */
function atActionPhase(s: SetupState): SetupState {
  return { ...s, turnPhase: 'action', currentPlayerID: 'pM' };
}

describe('computeNightmareDecisionState', () => {
  it('G 为 null → 不显示', () => {
    expect(computeNightmareDecisionState(null, 'pM', 'pM')).toEqual({
      visible: false,
      pendingLayers: [],
    });
  });

  it('非梦主回合 → 不显示', () => {
    const s = atActionPhase(withCoinVaultAndHiddenNightmare(scenarioStartOfGame3p(), 2));
    expect(computeNightmareDecisionState(s, 'p1', 'pM')).toEqual({
      visible: false,
      pendingLayers: [],
    });
  });

  it('梦主回合 + action + 金币金库已开 + 未翻开梦魇 → 显示', () => {
    const s = atActionPhase(withCoinVaultAndHiddenNightmare(scenarioStartOfGame3p(), 2));
    const r = computeNightmareDecisionState(s, 'pM', 'pM');
    expect(r.visible).toBe(true);
    expect(r.pendingLayers).toEqual([2]);
  });

  it('非 action 阶段 → 不显示', () => {
    const s: SetupState = {
      ...withCoinVaultAndHiddenNightmare(scenarioStartOfGame3p(), 2),
      turnPhase: 'discard',
      currentPlayerID: 'pM',
    };
    expect(computeNightmareDecisionState(s, 'pM', 'pM').visible).toBe(false);
  });

  it('金币金库未开 → 不显示', () => {
    const s0 = scenarioStartOfGame3p();
    // 仅 setLayerNightmare 不开金库
    const s = atActionPhase({
      ...s0,
      layers: {
        ...s0.layers,
        2: {
          ...s0.layers[2]!,
          nightmareId: 'nightmare_despair_storm',
          nightmareRevealed: false,
          nightmareTriggered: false,
        },
      },
    });
    expect(computeNightmareDecisionState(s, 'pM', 'pM').visible).toBe(false);
  });

  it('dreamMasterID 为空 → 不显示', () => {
    const s = atActionPhase(withCoinVaultAndHiddenNightmare(scenarioStartOfGame3p(), 2));
    expect(computeNightmareDecisionState(s, 'pM', '').visible).toBe(false);
  });

  it('多层同时待决策 → pendingLayers 全部返回', () => {
    let s = scenarioStartOfGame3p();
    s = withCoinVaultAndHiddenNightmare(s, 2);
    s = withCoinVaultAndHiddenNightmare(s, 3);
    s = atActionPhase(s);
    const r = computeNightmareDecisionState(s, 'pM', 'pM');
    expect(r.visible).toBe(true);
    expect(r.pendingLayers.sort()).toEqual([2, 3]);
  });
});
