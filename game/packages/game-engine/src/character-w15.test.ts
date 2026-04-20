// W15 双面 / 扩展 9 角色单测
// 对照：plans/tasks.md Phase 3 W15 · 双子/双鱼/露娜/白羊/盖亚/射手/水瓶/格林射线/达尔文
// 对照：docs/manual/05-dream-thieves.md
//
// 完整接入：双子 / 双鱼 / 露娜（含翻面）/ 盖亚 / 达尔文 + 水瓶（解封无限被动）
// 纯函数：白羊 / 射手 / 水瓶（同名重用）/ 格林射线（接入待响应窗口）

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  applyGeminiSync,
  applyPiscesEvade,
  canPiscesEvade,
  applyLunaEclipse,
  applyGaiaShift,
  applyDarwinEvolution,
  isAquariusUnlimitedActive,
  ariesExtraDrawCount,
  applySagittariusHeartLock,
  canGreenRayActivate,
  GEMINI_SKILL_ID,
  PISCES_SKILL_ID,
  LUNA_SKILL_ID,
  GAIA_SKILL_ID,
  DARWIN_SKILL_ID,
} from './engine/skills.js';
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

// ============================================================================
// 双子 · 协同（双面）
// ============================================================================
describe('双子 · 协同（thief_gemini）', () => {
  function setupGeminiScenario(): SetupState {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gemini' as CardID);
    s = setLayer(s, 'pM', 3 as Layer);
    return { ...s, turnPhase: 'discard' };
  }

  it('骰 3：心锁 -2 + 翻面', () => {
    const s = setupGeminiScenario();
    const r = applyGeminiSync(s, 'p1', 3);
    expect(r).not.toBeNull();
    expect(r!.layers[1]!.heartLockValue).toBe(s.layers[1]!.heartLockValue - 2);
    expect(r!.players.p1!.characterId).toBe('thief_gemini_back');
    expect(r!.players.p1!.skillUsedThisTurn[GEMINI_SKILL_ID]).toBe(1);
  });

  it('骰非 3：仅翻面，心锁不变', () => {
    const s = setupGeminiScenario();
    const r = applyGeminiSync(s, 'p1', 5);
    expect(r).not.toBeNull();
    expect(r!.layers[1]!.heartLockValue).toBe(s.layers[1]!.heartLockValue);
    expect(r!.players.p1!.characterId).toBe('thief_gemini_back');
  });

  it('拒绝：梦主层 <= self 层', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gemini' as CardID);
    s = { ...s, turnPhase: 'discard' };
    expect(applyGeminiSync(s, 'p1', 3)).toBeNull();
  });

  it('move 接入：playGeminiSync', () => {
    const s = setupGeminiScenario();
    const r = callMove(s, 'playGeminiSync', [], { rolls: [3] });
    expectMoveOk(r);
    expect(r.players.p1!.characterId).toBe('thief_gemini_back');
  });
});

// ============================================================================
// 双鱼 · 闪避（双面）
// ============================================================================
describe('双鱼 · 闪避（thief_pisces）', () => {
  it('成功：layer 2 → 1 + 翻面', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_pisces' as CardID);
    s = setLayer(s, 'p1', 2 as Layer);
    expect(canPiscesEvade(s.players.p1!)).toBe(true);
    const r = applyPiscesEvade(s, 'p1');
    expect(r).not.toBeNull();
    expect(r!.players.p1!.currentLayer).toBe(1);
    expect(r!.players.p1!.characterId).toBe('thief_pisces_back');
    expect(r!.players.p1!.skillUsedThisTurn[PISCES_SKILL_ID]).toBe(1);
  });

  it('拒绝：在 layer 1 无法向下', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_pisces' as CardID);
    expect(canPiscesEvade(s.players.p1!)).toBe(false);
    expect(applyPiscesEvade(s, 'p1')).toBeNull();
  });

  it('拒绝：本回合已用过', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_pisces' as CardID);
    s = setLayer(s, 'p1', 3 as Layer);
    const once = applyPiscesEvade(s, 'p1');
    expect(once).not.toBeNull();
    // 翻面后 characterId 变成 _back，已不是 thief_pisces，所以二次调用直接拒绝
    expect(applyPiscesEvade(once!, 'p1')).toBeNull();
  });
});

// ============================================================================
// 露娜 · 月蚀（双面）
// ============================================================================
describe('露娜 · 月蚀（thief_luna）', () => {
  function setupLunaScenario(): SetupState {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_luna' as CardID);
    s = setHand(s, 'p1', ['action_shoot', 'action_shoot', 'action_kick'] as CardID[]);
    return s;
  }

  it('成功：弃 2 SHOOT 击杀同层 target + 翻面', () => {
    const s = setupLunaScenario();
    const r = applyLunaEclipse(s, 'p1', ['action_shoot', 'action_shoot'] as CardID[], 'p2');
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(false);
    expect(r!.players.p1!.hand).toEqual(['action_kick']);
    expect(r!.players.p1!.characterId).toBe('thief_luna_back');
    expect(r!.players.p1!.skillUsedThisTurn[LUNA_SKILL_ID]).toBe(1);
  });

  it('拒绝：仅弃 1 SHOOT', () => {
    const s = setupLunaScenario();
    expect(applyLunaEclipse(s, 'p1', ['action_shoot'] as CardID[], 'p2')).toBeNull();
  });

  it('拒绝：弃非 SHOOT 类', () => {
    const s = setupLunaScenario();
    expect(applyLunaEclipse(s, 'p1', ['action_shoot', 'action_kick'] as CardID[], 'p2')).toBeNull();
  });

  it('拒绝：跨层 target', () => {
    let s = setupLunaScenario();
    s = setLayer(s, 'p2', 3 as Layer);
    expect(
      applyLunaEclipse(s, 'p1', ['action_shoot', 'action_shoot'] as CardID[], 'p2'),
    ).toBeNull();
  });

  it('move 接入：playLunaEclipse', () => {
    const s = setupLunaScenario();
    const r = callMove(s, 'playLunaEclipse', [['action_shoot', 'action_shoot'] as CardID[], 'p2']);
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });
});

// ============================================================================
// 盖亚 · 大地
// ============================================================================
describe('盖亚 · 大地（thief_gaia）', () => {
  it('成功：同层 p2 移到 layer 2', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gaia' as CardID);
    const r = applyGaiaShift(s, 'p1', { p2: 1 });
    expect(r).not.toBeNull();
    expect(r!.players.p2!.currentLayer).toBe(2);
    expect(r!.players.p1!.skillUsedThisTurn[GAIA_SKILL_ID]).toBe(1);
  });

  it('拒绝：方向超出 layer 范围（layer 1 -1 = 0）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gaia' as CardID);
    expect(applyGaiaShift(s, 'p1', { p2: -1 })).toBeNull();
  });

  it('拒绝：包含非同层玩家', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gaia' as CardID);
    s = setLayer(s, 'p2', 3 as Layer);
    expect(applyGaiaShift(s, 'p1', { p2: 1 })).toBeNull();
  });

  it('限制：本回合 2 次', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gaia' as CardID);
    const r1 = applyGaiaShift(s, 'p1', { p2: 1 });
    expect(r1).not.toBeNull();
    // 第 2 次需要重置 p2 同层
    const s2 = setLayer(r1!, 'p2', 1 as Layer);
    const r2 = applyGaiaShift(s2, 'p1', { p2: 1 });
    expect(r2).not.toBeNull();
    const s3 = setLayer(r2!, 'p2', 1 as Layer);
    expect(applyGaiaShift(s3, 'p1', { p2: 1 })).toBeNull();
  });

  it('move 接入：playGaiaShift', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gaia' as CardID);
    const r = callMove(s, 'playGaiaShift', [{ p2: 1 }]);
    expectMoveOk(r);
    expect(r.players.p2!.currentLayer).toBe(2);
  });
});

// ============================================================================
// 达尔文 · 进化
// ============================================================================
describe('达尔文 · 进化（thief_darwin）', () => {
  it('成功：抽 2 + 还 2 到顶', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_darwin' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    s = {
      ...s,
      deck: {
        cards: ['action_creation', 'action_peek', 'action_unlock'] as CardID[],
        discardPile: [],
      },
    };
    // 抽顶 2 = action_creation, action_peek
    // 手牌临时：[kick, creation, peek]
    // 还回 [kick, peek]，留下 creation 在手中
    const r = applyDarwinEvolution(s, 'p1', ['action_kick', 'action_peek'] as CardID[]);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_creation']);
    expect(r!.deck.cards).toEqual(['action_kick', 'action_peek', 'action_unlock']);
    expect(r!.players.p1!.skillUsedThisTurn[DARWIN_SKILL_ID]).toBe(1);
  });

  it('拒绝：牌库不足 2', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_darwin' as CardID);
    s = { ...s, deck: { cards: ['action_kick'] as CardID[], discardPile: [] } };
    expect(applyDarwinEvolution(s, 'p1', ['action_kick', 'action_kick'] as CardID[])).toBeNull();
  });

  it('move 接入：playDarwinEvolution', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_darwin' as CardID);
    s = { ...s, deck: { cards: ['action_creation', 'action_peek'] as CardID[], discardPile: [] } };
    const r = callMove(s, 'playDarwinEvolution', [['action_creation', 'action_peek'] as CardID[]]);
    expectMoveOk(r);
    expect(r.deck.cards).toEqual(['action_creation', 'action_peek']);
  });
});

// ============================================================================
// 水瓶 · 同流（解封无限被动）
// ============================================================================
describe('水瓶 · 同流（thief_aquarius）', () => {
  it('isAquariusUnlimitedActive：水瓶活着 → true', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius' as CardID);
    expect(isAquariusUnlimitedActive(s.players.p1!)).toBe(true);
  });

  it('集成：解封无次数限制（已达上限仍可解封）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_aquarius' as CardID);
    s = setHand(s, 'p1', ['action_unlock', 'action_unlock'] as CardID[]);
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, successfulUnlocksThisTurn: 1 },
      },
    };
    const r = callMove(s, 'playUnlock', ['action_unlock' as CardID]);
    expectMoveOk(r);
    expect(r.pendingUnlock).not.toBeNull();
  });
});

// ============================================================================
// 白羊 / 射手 / 格林射线（纯函数）
// ============================================================================
describe('白羊 · 解封者（thief_aries）', () => {
  it('ariesExtraDrawCount = 已弃梦魇数', () => {
    const s = scenarioActionPhase();
    expect(ariesExtraDrawCount(s)).toBe(0);
    const s2 = {
      ...s,
      usedNightmareIds: ['nightmare_a', 'nightmare_b'] as CardID[],
    };
    expect(ariesExtraDrawCount(s2)).toBe(2);
  });
});

describe('射手 · 神射（thief_sagittarius）', () => {
  it('心锁 +1 in cap', () => {
    const s = scenarioActionPhase();
    // layer 1 默认 hl=5, cap=5 → +1 不变
    expect(applySagittariusHeartLock(s, 1, 1, 5)?.layers[1]?.heartLockValue).toBe(5);
  });
  it('心锁 -1 减少', () => {
    const s = scenarioActionPhase();
    const r = applySagittariusHeartLock(s, 1, -1, 5);
    expect(r?.layers[1]?.heartLockValue).toBe(4);
  });
  it('心锁 -1 但已为 0 → 无变化', () => {
    let s = scenarioActionPhase();
    s = { ...s, layers: { ...s.layers, 1: { ...s.layers[1]!, heartLockValue: 0 } } };
    const r = applySagittariusHeartLock(s, 1, -1, 5);
    expect(r).toBe(s);
  });
});

describe('格林射线 · 移转（thief_green_ray · 扩展）', () => {
  it('canGreenRayActivate：含梦境穿梭剂 + SHOOT', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_green_ray' as CardID);
    s = setHand(s, 'p1', ['action_dream_transit', 'action_shoot'] as CardID[]);
    expect(canGreenRayActivate(s.players.p1!)).toBe(true);
  });
  it('缺穿梭剂 → false', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_green_ray' as CardID);
    s = setHand(s, 'p1', ['action_shoot'] as CardID[]);
    expect(canGreenRayActivate(s.players.p1!)).toBe(false);
  });
});
