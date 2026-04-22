// 巨蟹 · 气场 + 庇佑 双被动单测
// 对照：docs/manual/05-dream-thieves.md 巨蟹
// 对照：plans/report/skill-development-status.md 批次 A · A1

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { getCancerAuraBonus, isCancerShelterActive } from './engine/skills.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { scenarioActionPhase } from './testing/scenarios.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return { ...state, players: { ...state.players, [playerID]: { ...p, hand } } };
}

function setLayer(state: SetupState, playerID: string, layer: Layer): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  const oldL = p.currentLayer;
  if (oldL === layer) return state;
  const fromL = state.layers[oldL];
  const toL = state.layers[layer];
  if (!fromL || !toL) return state;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, currentLayer: layer } },
    layers: {
      ...state.layers,
      [oldL]: { ...fromL, playersInLayer: fromL.playersInLayer.filter((id) => id !== playerID) },
      [layer]: { ...toL, playersInLayer: [...toL.playersInLayer, playerID] },
    },
  };
}

function killPlayer(state: SetupState, playerID: string): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  const fromL = state.layers[p.currentLayer];
  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: { ...p, isAlive: false, currentLayer: 0 as Layer },
    },
    layers: fromL
      ? {
          ...state.layers,
          [p.currentLayer]: {
            ...fromL,
            playersInLayer: fromL.playersInLayer.filter((id) => id !== playerID),
          },
        }
      : state.layers,
  };
}

// =============================================================================
// 气场（skill_0）
// =============================================================================

describe('巨蟹 · 气场（被动抽牌 +1）', () => {
  it('同层有活着的巨蟹 → 自己抽牌 +1', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_cancer');
    // p1, p2（巨蟹）同在 L1
    expect(getCancerAuraBonus(s, 'p1')).toBe(1);
    // 巨蟹自己也享受（manual "所在层所有玩家"含自己）
    expect(getCancerAuraBonus(s, 'p2')).toBe(1);
  });

  it('非同层 → 不触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_cancer');
    s = setLayer(s, 'p2', 3 as Layer);
    expect(getCancerAuraBonus(s, 'p1')).toBe(0);
  });

  it('巨蟹死亡 → 不触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_cancer');
    s = killPlayer(s, 'p2');
    expect(getCancerAuraBonus(s, 'p1')).toBe(0);
  });

  it('巨蟹在迷失层 → 不触发（迷失层不受技能/行动牌影响）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_cancer');
    // 强制让 p2 还活着但在 0 层
    const fromL = s.layers[1]!;
    s = {
      ...s,
      players: {
        ...s.players,
        p2: { ...s.players.p2!, currentLayer: 0 as Layer },
      },
      layers: {
        ...s.layers,
        1: { ...fromL, playersInLayer: fromL.playersInLayer.filter((id) => id !== 'p2') },
      },
    };
    expect(getCancerAuraBonus(s, 'p1')).toBe(0);
  });

  it('doDraw 实际多抽 1 张（同层）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_cancer');
    s = { ...s, turnPhase: 'draw' };
    // deck 有 20 张 unlock，p1 抽 2 基础 + 1 气场 = 3 张
    const before = s.players.p1!.hand.length;
    const res = callMove(s, 'doDraw', []);
    expectMoveOk(res);
    expect(res.players.p1!.hand.length - before).toBe(3);
  });

  it('气场与盛夏世界观叠加：盗梦者抽 2 + 1(盛夏) + 1(气场) = 4', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_cancer');
    s = setCharacter(s, 'pM', 'dm_midsummer');
    s = { ...s, turnPhase: 'draw' };
    const before = s.players.p1!.hand.length;
    const res = callMove(s, 'doDraw', []);
    expectMoveOk(res);
    expect(res.players.p1!.hand.length - before).toBe(4);
  });
});

// =============================================================================
// 庇佑（skill_1）
// =============================================================================

describe('巨蟹 · 庇佑（被动无手牌上限）', () => {
  it('同层玩家手牌 7 张时 → 允许 skipDiscard', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_cancer');
    s = setHand(s, 'p1', [
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
    ] as CardID[]);
    s = { ...s, turnPhase: 'discard' };
    expect(isCancerShelterActive(s, 'p1')).toBe(true);
    const res = callMove(s, 'skipDiscard', []);
    expectMoveOk(res);
    // skipDiscard 成功时 events.endTurn 被调用；这里只验证 move 未被拒绝
    expect(res.players.p1!.hand.length).toBe(7);
  });

  it('非同层玩家手牌 7 张时 → 拒绝 skipDiscard', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_cancer');
    s = setLayer(s, 'p2', 3 as Layer);
    s = setHand(s, 'p1', [
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
    ] as CardID[]);
    s = { ...s, turnPhase: 'discard' };
    expect(isCancerShelterActive(s, 'p1')).toBe(false);
    const res = callMove(s, 'skipDiscard', []);
    expect(res).toBe('INVALID_MOVE');
  });

  it('巨蟹死亡 → 庇佑失效', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_cancer');
    s = killPlayer(s, 'p2');
    expect(isCancerShelterActive(s, 'p1')).toBe(false);
  });
});
