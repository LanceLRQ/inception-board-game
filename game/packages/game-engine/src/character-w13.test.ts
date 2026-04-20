// W13 盗梦者 7 角色技能单测
// 对照：plans/tasks.md Phase 3 W13 · 阿波罗/雅典娜/筑梦师/处女/哈雷/殉道者/灵雕师
// 对照：docs/manual/05-dream-thieves.md
//
// Tier A 完整接入：阿波罗·崇拜 / 殉道者·牺牲 / 灵雕师·雕琢 / 雅典娜·惊叹 / 哈雷·冲击
// Tier B 纯函数：处女·完美 / 筑梦师·迷宫 / 雅典娜·急智
// 跳过：阿波罗·日冕（元能力，待 abilities registry）

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  applyApolloWorship,
  applyMartyrSacrifice,
  applySoulSculptorCarve,
  applyHaleyImpact,
  applyAthenaAwe,
  applyAthenaWit,
  checkAthenaAweCondition,
  isVirgoPerfectTriggered,
  isShootClassCard,
  APOLLO_WORSHIP_SKILL_ID,
  MARTYR_SKILL_ID,
  ATHENA_AWE_SKILL_ID,
  HALEY_SKILL_ID,
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
// Tier A · 阿波罗 · 崇拜
// ============================================================================
describe('阿波罗 · 崇拜（thief_apollo · 1/2 技能）', () => {
  function setupApolloScenario(): SetupState {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_apollo' as CardID);
    s = setHand(s, 'p2', ['action_kick', 'action_unlock'] as CardID[]);
    // p2 受贿
    s = {
      ...s,
      players: { ...s.players, p2: { ...s.players.p2!, bribeReceived: 1 } },
    };
    return s;
  }

  it('成功：从受贿盗梦者随机抽 1 张入手', () => {
    const s = setupApolloScenario();
    const r = applyApolloWorship(s, 'p1', 'p2', 0); // pickIndex=0 → 'action_kick'
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_kick']);
    expect(r!.players.p2!.hand).toEqual(['action_unlock']);
    expect(r!.players.p1!.skillUsedThisTurn[APOLLO_WORSHIP_SKILL_ID]).toBe(1);
  });

  it('拒绝：target 未受贿', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_apollo' as CardID);
    s = setHand(s, 'p2', ['action_kick'] as CardID[]);
    expect(applyApolloWorship(s, 'p1', 'p2', 0)).toBeNull();
  });

  it('拒绝：target 是梦主', () => {
    let s = setupApolloScenario();
    s = { ...s, players: { ...s.players, pM: { ...s.players.pM!, bribeReceived: 1 } } };
    expect(applyApolloWorship(s, 'p1', 'pM', 0)).toBeNull();
  });

  it('拒绝：target 手牌为空', () => {
    let s = setupApolloScenario();
    s = setHand(s, 'p2', []);
    expect(applyApolloWorship(s, 'p1', 'p2', 0)).toBeNull();
  });

  it('限制：本回合 1 次', () => {
    const s = setupApolloScenario();
    const once = applyApolloWorship(s, 'p1', 'p2', 0);
    const twice = applyApolloWorship(once!, 'p1', 'p2', 0);
    expect(once).not.toBeNull();
    expect(twice).toBeNull();
  });

  it('move 接入：playApolloWorship', () => {
    const s = setupApolloScenario();
    // random.D6 默认返回 4，pickIndex = 4-1 = 3 → safeIdx = 3 % 2 = 1 → 'action_unlock'
    const r = callMove(s, 'playApolloWorship', ['p2'], { rolls: [4] });
    expectMoveOk(r);
    expect(r.players.p1!.hand).toEqual(['action_unlock']);
  });
});

// ============================================================================
// Tier A · 殉道者 · 牺牲
// ============================================================================
describe('殉道者 · 牺牲（thief_martyr）', () => {
  it('骰 4 + decrease：心锁 -2，自杀，弃手牌', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_martyr' as CardID);
    s = setHand(s, 'p1', ['action_unlock'] as CardID[]);
    // layer 1 默认 heartLockValue=5（PLAYER_COUNT_CONFIGS for 5p）
    const r = applyMartyrSacrifice(s, 'p1', 4, 'decrease', 5);
    expect(r).not.toBeNull();
    expect(r!.heartLockChanged).toBe(true);
    expect(r!.state.players.p1!.isAlive).toBe(false);
    expect(r!.state.players.p1!.hand).toEqual([]);
    expect(r!.state.players.p1!.currentLayer).toBe(0);
    expect(r!.state.layers[1]!.heartLockValue).toBe(3);
    expect(r!.state.deck.discardPile).toContain('action_unlock');
    expect(r!.state.players.p1!.skillUsedThisTurn[MARTYR_SKILL_ID]).toBe(1);
  });

  it('骰 1 / 2：仍自杀，但心锁不变', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_martyr' as CardID);
    const r = applyMartyrSacrifice(s, 'p1', 2, 'decrease', 5);
    expect(r).not.toBeNull();
    expect(r!.heartLockChanged).toBe(false);
    expect(r!.state.players.p1!.isAlive).toBe(false);
    // 心锁不变
    expect(r!.state.layers[1]!.heartLockValue).toBe(s.layers[1]!.heartLockValue);
  });

  it('增加心锁不超过 cap', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_martyr' as CardID);
    // 当前 layer 1 心锁=5，cap=5 → +2 → cap → 仍 5
    const r = applyMartyrSacrifice(s, 'p1', 5, 'increase', 5);
    expect(r).not.toBeNull();
    expect(r!.heartLockChanged).toBe(false);
    expect(r!.state.layers[1]!.heartLockValue).toBe(5);
  });

  it('move 接入：playMartyrSacrifice + setTurnPhase=discard', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_martyr' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    const r = callMove(s, 'playMartyrSacrifice', ['decrease'], { rolls: [4] });
    expectMoveOk(r);
    expect(r.players.p1!.isAlive).toBe(false);
    expect(r.turnPhase).toBe('discard');
  });
});

// ============================================================================
// Tier A · 灵雕师 · 雕琢（接入 applyShootVariant）
// ============================================================================
describe('灵雕师 · 雕琢（thief_soul_sculptor）', () => {
  it('纯函数 clamp [1,6]', () => {
    expect(applySoulSculptorCarve(0)).toBe(1);
    expect(applySoulSculptorCarve(3)).toBe(3);
    expect(applySoulSculptorCarve(7)).toBe(6);
    expect(applySoulSculptorCarve(-2)).toBe(1);
  });

  it('集成：target 手牌数=0 → 视为 1 → kill', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_soul_sculptor' as CardID);
    s = setHand(s, 'p1', ['action_shoot'] as CardID[]);
    s = setHand(s, 'p2', []);
    // p2 手牌 0 → 视为 1（命中 deathFaces=[1]）→ kill；rolls 不消费
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [6] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });

  it('集成：target 手牌数=3 → roll=3 → move', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_soul_sculptor' as CardID);
    s = setHand(s, 'p1', ['action_shoot'] as CardID[]);
    s = setHand(s, 'p2', ['action_kick', 'action_unlock', 'action_creation'] as CardID[]);
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID]);
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(2);
  });

  it('集成：target 手牌数=6 → roll=6 → miss', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_soul_sculptor' as CardID);
    s = setHand(s, 'p1', ['action_shoot'] as CardID[]);
    s = setHand(s, 'p2', Array(6).fill('action_kick') as CardID[]);
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID]);
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(1);
  });
});

// ============================================================================
// Tier A · 哈雷 · 冲击
// ============================================================================
describe('哈雷 · 冲击（thief_haley）', () => {
  it('纯函数：rawRoll-2 clamp [1,6]', () => {
    expect(applyHaleyImpact(3)).toBe(1);
    expect(applyHaleyImpact(1)).toBe(1);
    expect(applyHaleyImpact(6)).toBe(4);
  });

  it('move 接入：解封次数 0 时拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_haley' as CardID);
    expect(callMove(s, 'playHaleyImpact', ['p2'])).toBe('INVALID_MOVE');
  });

  it('move 接入：解封 1 次后可触发；rawRoll=3 → final=1 → kill', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_haley' as CardID);
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, successfulUnlocksThisTurn: 1 } },
    };
    const r = callMove(s, 'playHaleyImpact', ['p2'], { rolls: [3] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
    expect(r.players.p1!.skillUsedThisTurn[HALEY_SKILL_ID]).toBe(1);
  });

  it('move 接入：rawRoll=6 → final=4 → move', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_haley' as CardID);
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, successfulUnlocksThisTurn: 1 } },
    };
    const r = callMove(s, 'playHaleyImpact', ['p2'], { rolls: [6] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(2);
  });

  it('move 接入：解封 1 次时只能触发 1 次', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_haley' as CardID);
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, successfulUnlocksThisTurn: 1 } },
    };
    const r1 = callMove(s, 'playHaleyImpact', ['p2'], { rolls: [6] });
    expectMoveOk(r1);
    // 第二次：used=1 == successfulUnlocksThisTurn=1 → 拒绝
    expect(callMove(r1, 'playHaleyImpact', ['p2'], { rolls: [3] })).toBe('INVALID_MOVE');
  });
});

// ============================================================================
// Tier A · 雅典娜 · 惊叹
// ============================================================================
describe('雅典娜 · 惊叹（thief_athena · 2/2 技能）', () => {
  it('checkAthenaAweCondition：5 张同名 → false', () => {
    expect(
      checkAthenaAweCondition([
        'action_kick',
        'action_kick',
        'action_unlock',
        'action_creation',
        'action_peek',
      ] as CardID[]),
    ).toBe(false);
  });
  it('checkAthenaAweCondition：5 张全不同 → true', () => {
    expect(
      checkAthenaAweCondition([
        'action_kick',
        'action_unlock',
        'action_creation',
        'action_peek',
        'action_shoot',
      ] as CardID[]),
    ).toBe(true);
  });

  it('成功：5 张全不同 → 击杀 target + 取手牌', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_athena' as CardID);
    s = setHand(s, 'p1', [
      'action_kick',
      'action_unlock',
      'action_creation',
      'action_peek',
    ] as CardID[]);
    s = setHand(s, 'p2', ['action_shoot_king'] as CardID[]);
    s = {
      ...s,
      deck: { cards: ['action_shoot'] as CardID[], discardPile: [] },
    };
    const r = applyAthenaAwe(
      s,
      'p1',
      ['action_kick', 'action_unlock', 'action_creation', 'action_peek'] as CardID[],
      'p2',
    );
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(false);
    expect(r!.players.p1!.hand).toContain('action_shoot_king');
    expect(r!.players.p1!.skillUsedThisTurn[ATHENA_AWE_SKILL_ID]).toBe(1);
  });

  it('失败：手牌+牌库顶含重名 → 技能消耗但 target 不死', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_athena' as CardID);
    s = setHand(s, 'p1', [
      'action_kick',
      'action_kick',
      'action_unlock',
      'action_peek',
    ] as CardID[]);
    s = setHand(s, 'p2', ['action_kick'] as CardID[]);
    s = { ...s, deck: { cards: ['action_shoot'] as CardID[], discardPile: [] } };
    const r = applyAthenaAwe(
      s,
      'p1',
      ['action_kick', 'action_kick', 'action_unlock', 'action_peek'] as CardID[],
      'p2',
    );
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(true);
    expect(r!.players.p1!.skillUsedThisTurn[ATHENA_AWE_SKILL_ID]).toBe(1);
  });

  it('拒绝：target 跨层', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_athena' as CardID);
    s = setHand(s, 'p1', [
      'action_kick',
      'action_unlock',
      'action_creation',
      'action_peek',
    ] as CardID[]);
    s = setLayer(s, 'p2', 3 as Layer);
    s = { ...s, deck: { cards: ['action_shoot'] as CardID[], discardPile: [] } };
    expect(
      applyAthenaAwe(
        s,
        'p1',
        ['action_kick', 'action_unlock', 'action_creation', 'action_peek'] as CardID[],
        'p2',
      ),
    ).toBeNull();
  });

  it('move 接入：playAthenaAwe', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_athena' as CardID);
    s = setHand(s, 'p1', [
      'action_kick',
      'action_unlock',
      'action_creation',
      'action_peek',
    ] as CardID[]);
    s = { ...s, deck: { cards: ['action_shoot'] as CardID[], discardPile: [] } };
    const r = callMove(s, 'playAthenaAwe', [
      ['action_kick', 'action_unlock', 'action_creation', 'action_peek'] as CardID[],
      'p2',
    ]);
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });
});

// ============================================================================
// Tier B · 处女 · 完美（纯函数）
// ============================================================================
describe('处女 · 完美 触发条件（thief_virgo）', () => {
  it('rawRoll=6 触发', () => {
    expect(isVirgoPerfectTriggered(6)).toBe(true);
  });
  it('rawRoll≠6 不触发', () => {
    for (let i = 1; i <= 5; i++) expect(isVirgoPerfectTriggered(i)).toBe(false);
  });
});

// ============================================================================
// Tier B · 筑梦师 · 迷宫（纯函数）
// ============================================================================
describe('筑梦师 · 迷宫 SHOOT 类判定（thief_architect）', () => {
  it('SHOOT 5 变体均判 true', () => {
    expect(isShootClassCard('action_shoot' as CardID)).toBe(true);
    expect(isShootClassCard('action_shoot_king' as CardID)).toBe(true);
    expect(isShootClassCard('action_shoot_armor' as CardID)).toBe(true);
    expect(isShootClassCard('action_shoot_burst' as CardID)).toBe(true);
    expect(isShootClassCard('action_shoot_dream_transit' as CardID)).toBe(true);
  });
  it('非 SHOOT 类判 false', () => {
    expect(isShootClassCard('action_unlock' as CardID)).toBe(false);
    expect(isShootClassCard('action_kick' as CardID)).toBe(false);
    expect(isShootClassCard('action_creation' as CardID)).toBe(false);
  });
});

// ============================================================================
// Tier B · 雅典娜 · 急智（纯函数）
// ============================================================================
describe('雅典娜 · 急智 抽弃牌堆（thief_athena · 1/2 技能）', () => {
  it('成功：取弃牌堆顶 1 张', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_athena' as CardID);
    s = {
      ...s,
      deck: { cards: [] as CardID[], discardPile: ['action_kick', 'action_unlock'] as CardID[] },
    };
    const r = applyAthenaWit(s, 'p1');
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_unlock']);
    expect(r!.deck.discardPile).toEqual(['action_kick']);
  });

  it('拒绝：弃牌堆为空', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_athena' as CardID);
    expect(applyAthenaWit(s, 'p1')).toBeNull();
  });

  it('拒绝：非雅典娜', () => {
    let s = scenarioActionPhase();
    s = { ...s, deck: { cards: [] as CardID[], discardPile: ['action_kick'] as CardID[] } };
    expect(applyAthenaWit(s, 'p1')).toBeNull();
  });
});
