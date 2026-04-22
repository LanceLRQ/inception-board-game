// 白羊 · 星尘（skill_0）单测：onKilled 简化 pending + 发动/弃二选一
// 对照：docs/manual/05-dream-thieves.md 白羊 62-71 行
// 对照：plans/report/skill-development-status.md 批次 A · A5

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  canAriesStardustTrigger,
  applyAriesStardustDiscard,
  applyAriesStardustReveal,
  findAliveAriesID,
} from './engine/skills.js';
import { scenarioActionPhase } from './testing/scenarios.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setLayerNightmare(
  state: SetupState,
  layer: Layer,
  nid: CardID | null,
  revealed = false,
): SetupState {
  const ls = state.layers[layer];
  if (!ls) return state;
  return {
    ...state,
    layers: {
      ...state.layers,
      [layer]: { ...ls, nightmareId: nid, nightmareRevealed: revealed },
    },
  };
}

function setPendingAriesChoice(
  state: SetupState,
  ariesID: string,
  victimLayer: number,
  victimID: string,
): SetupState {
  return { ...state, pendingAriesChoice: { ariesID, victimLayer, victimID } };
}

// =============================================================================
// canAriesStardustTrigger
// =============================================================================

describe('白羊 · 星尘 · 触发条件', () => {
  it('白羊存活 + 被击杀者非迷失层 + 该层有未翻梦魇 → 可触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_aries');
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_despair_storm' as CardID);
    expect(canAriesStardustTrigger(s, 'p1', 2)).toBe(true);
    expect(findAliveAriesID(s)).toBe('p2');
  });

  it('白羊死亡 → 不触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_aries');
    s = { ...s, players: { ...s.players, p2: { ...s.players.p2!, isAlive: false } } };
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_despair_storm' as CardID);
    expect(canAriesStardustTrigger(s, 'p1', 2)).toBe(false);
  });

  it('该层无梦魇 → 不触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_aries');
    expect(canAriesStardustTrigger(s, 'p1', 2)).toBe(false);
  });

  it('梦魇已翻开 → 不触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_aries');
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_despair_storm' as CardID, true);
    expect(canAriesStardustTrigger(s, 'p1', 2)).toBe(false);
  });

  it('白羊自己被击杀 → 保守实现：不触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_aries');
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm' as CardID);
    expect(canAriesStardustTrigger(s, 'p2', 1)).toBe(false);
  });

  it('受害者 victimLayer = 迷失层 → 不触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_aries');
    expect(canAriesStardustTrigger(s, 'p1', 0)).toBe(false);
  });
});

// =============================================================================
// applyAriesStardustDiscard
// =============================================================================

describe('白羊 · 星尘 · 弃牌分支', () => {
  it('弃掉梦魇 → nightmareId=null + usedNightmareIds +1 + pending 清空', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_aries');
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_despair_storm' as CardID);
    s = setPendingAriesChoice(s, 'p2', 2, 'p1');
    const res = applyAriesStardustDiscard(s);
    expect(res).not.toBeNull();
    expect(res!.layers[2]!.nightmareId).toBeNull();
    expect(res!.layers[2]!.nightmareTriggered).toBe(true);
    expect(res!.usedNightmareIds).toContain('nightmare_despair_storm');
    expect(res!.pendingAriesChoice).toBeNull();
  });

  it('无 pending → 返回 null', () => {
    const s = scenarioActionPhase();
    expect(applyAriesStardustDiscard(s)).toBeNull();
  });

  it('pending 指向的层已翻开 → 返回 null', () => {
    let s = scenarioActionPhase();
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_despair_storm' as CardID, true);
    s = setPendingAriesChoice(s, 'p2', 2, 'p1');
    expect(applyAriesStardustDiscard(s)).toBeNull();
  });
});

// =============================================================================
// applyAriesStardustReveal
// =============================================================================

describe('白羊 · 星尘 · 发动分支（reveal）', () => {
  it('翻开梦魇 + 清 pending（效果分发由 game.ts move 层执行）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p2', 'thief_aries');
    s = setLayerNightmare(s, 2 as Layer, 'nightmare_despair_storm' as CardID);
    s = setPendingAriesChoice(s, 'p2', 2, 'p1');
    const res = applyAriesStardustReveal(s);
    expect(res).not.toBeNull();
    expect(res!.layers[2]!.nightmareRevealed).toBe(true);
    // 梦魇 ID 仍在（尚未弃），供后续 applyNightmareEffect 取用
    expect(res!.layers[2]!.nightmareId).toBe('nightmare_despair_storm');
    expect(res!.pendingAriesChoice).toBeNull();
  });

  it('无 pending → 返回 null', () => {
    const s = scenarioActionPhase();
    expect(applyAriesStardustReveal(s)).toBeNull();
  });
});
