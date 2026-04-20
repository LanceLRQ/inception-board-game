// W11 盗梦者 3 角色技能单测
// 对照：plans/tasks.md Phase 3 W11 · 穿行者 / 狮子 / 摩羯
// 对照：docs/manual/05-dream-thieves.md
//
// 已实装角色（W11 之前）：先锋（thief_pointman）、译梦师（thief_dream_interpreter）→ 见 cards.test.ts / engine/skills.test.ts

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  applyTouristAssist,
  applyLeoKingdom,
  canUseTouristAssist,
  isCapricornusRhythmActive,
  TOURIST_SKILL_ID,
  LEO_SKILL_ID,
} from './engine/skills.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { scenarioActionPhase } from './testing/scenarios.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, characterId } },
  };
}

function setHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, hand } },
  };
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
// 穿行者 · 支助
// ============================================================================
describe('穿行者 · 支助（thief_tourist）', () => {
  it('成功：手牌全部转给 target + 自己移到 target 层', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_tourist' as CardID);
    s = setHand(s, 'p1', ['action_unlock', 'action_kick'] as CardID[]);
    s = setLayer(s, 'p2', 3 as Layer);

    const r = applyTouristAssist(s, 'p1', 'p2');
    expect(r).not.toBeNull();
    const next = r!;
    expect(next.players.p1!.hand).toEqual([]);
    expect(next.players.p2!.hand).toEqual(['action_unlock', 'action_kick']);
    expect(next.players.p1!.currentLayer).toBe(3);
    expect(next.players.p1!.skillUsedThisTurn[TOURIST_SKILL_ID]).toBe(1);
    expect(next.layers[3]!.playersInLayer).toContain('p1');
  });

  it('拒绝：非穿行者角色', () => {
    let s = scenarioActionPhase();
    s = setHand(s, 'p1', ['action_unlock'] as CardID[]); // characterId 默认 thief_p1
    expect(applyTouristAssist(s, 'p1', 'p2')).toBeNull();
  });

  it('拒绝：手牌为空', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_tourist' as CardID);
    expect(applyTouristAssist(s, 'p1', 'p2')).toBeNull();
  });

  it('拒绝：目标是自己', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_tourist' as CardID);
    s = setHand(s, 'p1', ['action_unlock'] as CardID[]);
    expect(applyTouristAssist(s, 'p1', 'p1')).toBeNull();
  });

  it('拒绝：目标已死亡', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_tourist' as CardID);
    s = setHand(s, 'p1', ['action_unlock'] as CardID[]);
    s = {
      ...s,
      players: { ...s.players, p2: { ...s.players.p2!, isAlive: false } },
    };
    expect(applyTouristAssist(s, 'p1', 'p2')).toBeNull();
  });

  it('拒绝：本回合已使用过', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_tourist' as CardID);
    s = setHand(s, 'p1', ['action_unlock', 'action_kick'] as CardID[]);
    const once = applyTouristAssist(s, 'p1', 'p2');
    expect(once).not.toBeNull();
    expect(canUseTouristAssist(once!, 'p1', 'p2')).toBe(false);
  });

  it('move 接入：playTouristAssist 与纯函数等价', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_tourist' as CardID);
    s = setHand(s, 'p1', ['action_unlock'] as CardID[]);
    s = setLayer(s, 'p2', 2 as Layer);
    const r = callMove(s, 'playTouristAssist', ['p2']);
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(2);
    expect(r.players.p2!.hand).toContain('action_unlock');
  });

  it('move 拒绝：非穿行者使用 → INVALID_MOVE', () => {
    const s = setHand(scenarioActionPhase(), 'p1', ['action_unlock'] as CardID[]);
    expect(callMove(s, 'playTouristAssist', ['p2'])).toBe('INVALID_MOVE');
  });
});

// ============================================================================
// 狮子 · 王道
// ============================================================================
describe('狮子 · 王道（thief_leo）', () => {
  it('梦主有手牌：从牌库顶额外抽 = 梦主手牌数', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_leo' as CardID);
    // 给梦主 3 张手牌
    s = {
      ...s,
      players: {
        ...s.players,
        pM: { ...s.players.pM!, hand: ['action_kick', 'action_kick', 'action_kick'] as CardID[] },
      },
      // 牌库顶 4 张可识别
      deck: {
        cards: ['action_creation', 'action_peek', 'action_unlock', 'action_kick'] as CardID[],
        discardPile: [],
      },
    };
    const r = applyLeoKingdom(s, 'p1');
    expect(r.players.p1!.hand).toEqual(['action_creation', 'action_peek', 'action_unlock']);
    expect(r.deck.cards).toEqual(['action_kick']);
    expect(r.players.p1!.skillUsedThisTurn[LEO_SKILL_ID]).toBe(1);
  });

  it('梦主无手牌但弃牌堆有牌：取弃牌堆顶 1 张', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_leo' as CardID);
    s = {
      ...s,
      deck: {
        cards: [] as CardID[],
        discardPile: ['action_unlock', 'action_creation'] as CardID[],
      },
    };
    const r = applyLeoKingdom(s, 'p1');
    expect(r.players.p1!.hand).toEqual(['action_creation']);
    expect(r.deck.discardPile).toEqual(['action_unlock']);
  });

  it('梦主无手牌且弃牌堆为空：技能消耗但无效果', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_leo' as CardID);
    const r = applyLeoKingdom(s, 'p1');
    expect(r.players.p1!.hand).toEqual([]);
    expect(r.players.p1!.skillUsedThisTurn[LEO_SKILL_ID]).toBe(1);
  });

  it('非狮子角色：不触发', () => {
    const s = scenarioActionPhase();
    const r = applyLeoKingdom(s, 'p1');
    expect(r).toBe(s);
  });

  it('本回合已使用：不重复触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_leo' as CardID);
    s = {
      ...s,
      players: {
        ...s.players,
        pM: { ...s.players.pM!, hand: ['action_kick'] as CardID[] },
      },
      deck: { cards: ['action_creation'] as CardID[], discardPile: [] },
    };
    const once = applyLeoKingdom(s, 'p1');
    expect(once.players.p1!.hand).toEqual(['action_creation']);
    const twice = applyLeoKingdom(once, 'p1');
    expect(twice).toBe(once); // 第二次直接返回原 state
  });
});

// ============================================================================
// 摩羯 · 节奏（被动）
// ============================================================================
describe('摩羯 · 节奏（thief_capricornus）', () => {
  it('激活：手牌数 = 所在层数字', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_capricornus' as CardID);
    s = setLayer(s, 'p1', 2 as Layer);
    s = setHand(s, 'p1', ['action_unlock', 'action_kick'] as CardID[]);
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(true);
  });

  it('激活：手牌数 > 所在层数字', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_capricornus' as CardID);
    s = setLayer(s, 'p1', 1 as Layer);
    s = setHand(s, 'p1', ['action_unlock', 'action_kick'] as CardID[]);
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(true);
  });

  it('未激活：手牌数 < 所在层数字', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_capricornus' as CardID);
    s = setLayer(s, 'p1', 3 as Layer);
    s = setHand(s, 'p1', ['action_unlock'] as CardID[]);
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(false);
  });

  it('未激活：非摩羯角色', () => {
    let s = scenarioActionPhase();
    s = setHand(s, 'p1', ['action_unlock', 'action_unlock'] as CardID[]);
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(false);
  });

  it('未激活：迷失层（layer 0）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_capricornus' as CardID);
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, currentLayer: 0 } },
    };
    expect(isCapricornusRhythmActive(s.players.p1!)).toBe(false);
  });

  it('解封次数豁免：节奏激活时可多次解封', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_capricornus' as CardID);
    s = setHand(s, 'p1', ['action_unlock', 'action_unlock', 'action_unlock'] as CardID[]);
    // 模拟已成功解封 1 次（达到 maxUnlockPerTurn=1 上限）
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

  it('解封次数限制：非摩羯达到上限 → INVALID_MOVE', () => {
    let s = scenarioActionPhase();
    s = setHand(s, 'p1', ['action_unlock', 'action_unlock'] as CardID[]);
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, successfulUnlocksThisTurn: 1 },
      },
    };
    expect(callMove(s, 'playUnlock', ['action_unlock' as CardID])).toBe('INVALID_MOVE');
  });

  it('SHOOT 跨层豁免：节奏激活时可对非同层目标 SHOOT', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_capricornus' as CardID);
    s = setHand(s, 'p1', ['action_shoot', 'action_unlock'] as CardID[]);
    // p1 在 L1，p2 在 L3（节奏：手牌 2 >= 层 1 → 激活）
    s = setLayer(s, 'p2', 3 as Layer);
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [1] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });

  it('SHOOT 跨层限制：非摩羯不可跨层 → INVALID_MOVE', () => {
    let s = scenarioActionPhase();
    s = setHand(s, 'p1', ['action_shoot'] as CardID[]);
    s = setLayer(s, 'p2', 3 as Layer);
    expect(callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [1] })).toBe(
      'INVALID_MOVE',
    );
  });
});
