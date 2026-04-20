// W12 盗梦者 7 角色技能单测
// 对照：plans/tasks.md Phase 3 W12 · 药剂师/灵魂牧师/战争之王/天秤/意念判官/天蝎/金牛
// 对照：docs/manual/05-dream-thieves.md
//
// Tier A（弃牌取牌类）：药剂师 / 战争之王 / 灵魂牧师 → 完整 skills + move 接入
// Tier B（SHOOT 修饰类）：意念判官 / 天蝎 / 金牛 → skills 纯函数（move 接入待批次）
// Tier C（多阶段交互）：天秤 → skills 纯函数（pendingLibra 状态机待批次）

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  applyChemistRefine,
  applyLordOfWarBlackMarket,
  applyPaprikSalvation,
  applySudgerVerdict,
  applyScorpiusPoison,
  applyTaurusHorn,
  libraValidateSplit,
  libraResolvePick,
  CHEMIST_SKILL_ID,
  LORD_OF_WAR_SKILL_ID,
  PAPRIK_SKILL_ID,
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

function setDiscard(state: SetupState, discardPile: CardID[]): SetupState {
  return { ...state, deck: { ...state.deck, discardPile } };
}

// ============================================================================
// Tier A · 药剂师 · 调剂
// ============================================================================
describe('药剂师 · 调剂（thief_chemist）', () => {
  it('成功：弃 1 手牌 → 弃牌堆梦境穿梭剂入手', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_chemist' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    s = setDiscard(s, ['action_dream_transit', 'action_unlock'] as CardID[]);
    const r = applyChemistRefine(s, 'p1', 'action_kick' as CardID);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_dream_transit']);
    expect(r!.deck.discardPile).toEqual(['action_unlock', 'action_kick']);
    expect(r!.players.p1!.skillUsedThisTurn[CHEMIST_SKILL_ID]).toBe(1);
  });

  it('拒绝：弃牌堆无梦境穿梭剂', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_chemist' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    expect(applyChemistRefine(s, 'p1', 'action_kick' as CardID)).toBeNull();
  });

  it('拒绝：弃牌不在手中', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_chemist' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    s = setDiscard(s, ['action_dream_transit'] as CardID[]);
    expect(applyChemistRefine(s, 'p1', 'action_unlock' as CardID)).toBeNull();
  });

  it('限制：本回合最多 2 次', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_chemist' as CardID);
    s = setHand(s, 'p1', ['action_kick', 'action_kick', 'action_kick'] as CardID[]);
    s = setDiscard(s, [
      'action_dream_transit',
      'action_dream_transit',
      'action_dream_transit',
    ] as CardID[]);
    const r1 = applyChemistRefine(s, 'p1', 'action_kick' as CardID);
    const r2 = applyChemistRefine(r1!, 'p1', 'action_kick' as CardID);
    const r3 = applyChemistRefine(r2!, 'p1', 'action_kick' as CardID);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).toBeNull();
  });

  it('move 接入：playChemistRefine', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_chemist' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    s = setDiscard(s, ['action_dream_transit'] as CardID[]);
    const r = callMove(s, 'playChemistRefine', ['action_kick' as CardID]);
    expectMoveOk(r);
    expect(r.players.p1!.hand).toEqual(['action_dream_transit']);
  });
});

// ============================================================================
// Tier A · 战争之王 · 黑市
// ============================================================================
describe('战争之王 · 黑市（thief_lord_of_war）', () => {
  it('成功：弃 2 手牌 → 弃牌堆任 1 张入手', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_lord_of_war' as CardID);
    s = setHand(s, 'p1', ['action_kick', 'action_unlock'] as CardID[]);
    s = setDiscard(s, ['action_creation', 'action_peek'] as CardID[]);
    const r = applyLordOfWarBlackMarket(
      s,
      'p1',
      ['action_kick', 'action_unlock'] as CardID[],
      'action_creation' as CardID,
    );
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_creation']);
    expect(r!.deck.discardPile).toEqual(['action_peek', 'action_kick', 'action_unlock']);
    expect(r!.players.p1!.skillUsedThisTurn[LORD_OF_WAR_SKILL_ID]).toBe(1);
  });

  it('拒绝：弃牌不足 2 张', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_lord_of_war' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    s = setDiscard(s, ['action_creation'] as CardID[]);
    expect(
      applyLordOfWarBlackMarket(s, 'p1', ['action_kick'] as CardID[], 'action_creation' as CardID),
    ).toBeNull();
  });

  it('拒绝：弃牌堆无目标牌', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_lord_of_war' as CardID);
    s = setHand(s, 'p1', ['action_kick', 'action_unlock'] as CardID[]);
    s = setDiscard(s, ['action_peek'] as CardID[]);
    expect(
      applyLordOfWarBlackMarket(
        s,
        'p1',
        ['action_kick', 'action_unlock'] as CardID[],
        'action_creation' as CardID,
      ),
    ).toBeNull();
  });

  it('限制：本回合 1 次', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_lord_of_war' as CardID);
    s = setHand(s, 'p1', [
      'action_kick',
      'action_unlock',
      'action_kick',
      'action_unlock',
    ] as CardID[]);
    s = setDiscard(s, ['action_creation', 'action_peek'] as CardID[]);
    const r1 = applyLordOfWarBlackMarket(
      s,
      'p1',
      ['action_kick', 'action_unlock'] as CardID[],
      'action_creation' as CardID,
    );
    const r2 = applyLordOfWarBlackMarket(
      r1!,
      'p1',
      ['action_kick', 'action_unlock'] as CardID[],
      'action_peek' as CardID,
    );
    expect(r1).not.toBeNull();
    expect(r2).toBeNull();
  });

  it('move 接入：playLordOfWarBlackMarket', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_lord_of_war' as CardID);
    s = setHand(s, 'p1', ['action_kick', 'action_unlock'] as CardID[]);
    s = setDiscard(s, ['action_creation'] as CardID[]);
    const r = callMove(s, 'playLordOfWarBlackMarket', [
      ['action_kick', 'action_unlock'] as CardID[],
      'action_creation' as CardID,
    ]);
    expectMoveOk(r);
    expect(r.players.p1!.hand).toEqual(['action_creation']);
  });
});

// ============================================================================
// Tier A · 灵魂牧师 · 拯救
// ============================================================================
describe('灵魂牧师 · 拯救（thief_paprik）', () => {
  function setupSalvationScenario(): SetupState {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_paprik' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    // 让 p2 死亡进迷失层
    s = {
      ...s,
      players: {
        ...s.players,
        p2: {
          ...s.players.p2!,
          isAlive: false,
          deathTurn: 1,
          currentLayer: 0,
          hand: ['action_unlock', 'action_creation'] as CardID[],
        },
      },
      layers: {
        ...s.layers,
        1: {
          ...s.layers[1]!,
          playersInLayer: s.layers[1]!.playersInLayer.filter((id) => id !== 'p2'),
        },
      },
    };
    return s;
  }

  it('成功：复活 + 取手牌 + 移到 self 层', () => {
    const s = setupSalvationScenario();
    const r = applyPaprikSalvation(s, 'p1', 'action_kick' as CardID, 'p2');
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(true);
    expect(r!.players.p2!.deathTurn).toBeNull();
    expect(r!.players.p2!.hand).toEqual([]);
    expect(r!.players.p2!.currentLayer).toBe(1);
    expect(r!.players.p1!.hand).toEqual(['action_unlock', 'action_creation']);
    expect(r!.deck.discardPile).toContain('action_kick');
    expect(r!.players.p1!.skillUsedThisTurn[PAPRIK_SKILL_ID]).toBe(1);
  });

  it('拒绝：target 还活着', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_paprik' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    expect(applyPaprikSalvation(s, 'p1', 'action_kick' as CardID, 'p2')).toBeNull();
  });

  it('拒绝：target 是自己', () => {
    const s = setupSalvationScenario();
    expect(applyPaprikSalvation(s, 'p1', 'action_kick' as CardID, 'p1')).toBeNull();
  });

  it('限制：本回合 2 次', () => {
    let s = setupSalvationScenario();
    // 加多一名死者 + 给 p1 第二张弃牌
    s = setHand(s, 'p1', ['action_kick', 'action_kick', 'action_kick'] as CardID[]);
    s = {
      ...s,
      players: {
        ...s.players,
        p3: undefined as unknown as SetupState['players'][string], // 删除占位（避免类型骚扰）
      },
    };
    // 简化：靠 skillUsedThisTurn 直接灌满
    const after2 = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { [PAPRIK_SKILL_ID]: 2 } },
      },
    };
    expect(applyPaprikSalvation(after2, 'p1', 'action_kick' as CardID, 'p2')).toBeNull();
  });

  it('move 接入：playPaprikSalvation', () => {
    const s = setupSalvationScenario();
    const r = callMove(s, 'playPaprikSalvation', ['action_kick' as CardID, 'p2']);
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p1!.hand.length).toBe(2);
  });
});

// ============================================================================
// Tier B · 意念判官 · 定罪（双骰择其一）
// ============================================================================
describe('意念判官 · 定罪（thief_sudger_of_mind）', () => {
  it('选择 A：返回 rollA', () => {
    expect(applySudgerVerdict(2, 5, 'A')).toBe(2);
  });
  it('选择 B：返回 rollB', () => {
    expect(applySudgerVerdict(2, 5, 'B')).toBe(5);
  });
  it('两骰相同：选哪个都一样', () => {
    expect(applySudgerVerdict(3, 3, 'A')).toBe(3);
    expect(applySudgerVerdict(3, 3, 'B')).toBe(3);
  });
});

// ============================================================================
// Tier B · 天蝎 · 毒针（双骰差值，0 视为 1）
// ============================================================================
describe('天蝎 · 毒针（thief_scorpius）', () => {
  it('差值 = |a - b|', () => {
    expect(applyScorpiusPoison(5, 2)).toBe(3);
    expect(applyScorpiusPoison(2, 5)).toBe(3);
    expect(applyScorpiusPoison(6, 1)).toBe(5);
  });
  it('差值 0 → 视为 1', () => {
    expect(applyScorpiusPoison(4, 4)).toBe(1);
  });
  it('正常 SHOOT 流程：1 视为 kill（验证 1 点击杀的结合点）', () => {
    // 不在 dice.ts 范围里测，但确认 0→1 的语义在这里
    expect(applyScorpiusPoison(3, 3)).toBe(1);
  });
});

// ============================================================================
// Tier B · 金牛 · 号角（对掷比大小）
// ============================================================================
describe('金牛 · 号角（thief_taurus）', () => {
  it('self > target → kill', () => {
    expect(applyTaurusHorn(2, 5)).toBe('kill');
  });
  it('self == target → normal', () => {
    expect(applyTaurusHorn(3, 3)).toBe('normal');
  });
  it('self < target → normal', () => {
    expect(applyTaurusHorn(5, 2)).toBe('normal');
  });
});

// ============================================================================
// Tier C · 天秤 · 平衡（手牌分组拣选）
// ============================================================================
describe('天秤 · 平衡（thief_libra）', () => {
  it('split 校验：合法划分通过', () => {
    const total = ['action_kick', 'action_unlock', 'action_creation'] as CardID[];
    expect(libraValidateSplit(total, ['action_kick'], ['action_unlock', 'action_creation'])).toBe(
      true,
    );
  });

  it('split 校验：数量错误拒绝', () => {
    const total = ['action_kick', 'action_unlock'] as CardID[];
    expect(libraValidateSplit(total, ['action_kick'], [])).toBe(false);
  });

  it('split 校验：内容错误拒绝（虚构卡）', () => {
    const total = ['action_kick', 'action_unlock'] as CardID[];
    expect(libraValidateSplit(total, ['action_kick'], ['action_creation' as CardID])).toBe(false);
  });

  it('split 校验：重复卡（multiset）通过', () => {
    const total = ['action_kick', 'action_kick', 'action_unlock'] as CardID[];
    expect(libraValidateSplit(total, ['action_kick'], ['action_kick', 'action_unlock'])).toBe(true);
  });

  it('pick：选 pile1 → self 拿 pile1，target 拿 pile2', () => {
    const r = libraResolvePick(
      { pile1: ['action_kick'] as CardID[], pile2: ['action_unlock'] as CardID[] },
      'pile1',
    );
    expect(r.selfGets).toEqual(['action_kick']);
    expect(r.targetGets).toEqual(['action_unlock']);
  });

  it('pick：选 pile2 → self 拿 pile2，target 拿 pile1', () => {
    const r = libraResolvePick(
      { pile1: ['action_kick'] as CardID[], pile2: ['action_unlock'] as CardID[] },
      'pile2',
    );
    expect(r.selfGets).toEqual(['action_unlock']);
    expect(r.targetGets).toEqual(['action_kick']);
  });

  it('pick：返回的是新数组（不引用原 split）', () => {
    const split = {
      pile1: ['action_kick'] as CardID[],
      pile2: ['action_unlock'] as CardID[],
    };
    const r = libraResolvePick(split, 'pile1');
    r.selfGets.push('action_creation' as CardID);
    expect(split.pile1).toEqual(['action_kick']);
  });
});
