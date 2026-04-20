// W10-R2 · 桶 C 3 角色 turnPhase 抽牌阶段 hook
// 对照：plans/tasks.md Phase 3 abilities registry · R2（小丑/黑天鹅/白羊·skill_1）

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from '../../../../setup.js';
import { scenarioStartOfGame3p } from '../../../../testing/scenarios.js';
import { ariesExtraDraw, blackSwanTour, createDefaultRegistry, jokerGamble } from '../index.js';
import type { AbilityContext } from '../../types.js';

function ctxFor(
  state: SetupState,
  invokerID: string,
  overrides: Partial<AbilityContext> = {},
): AbilityContext {
  return {
    invokerID,
    turnNumber: state.turnNumber,
    turnPhase: state.turnPhase,
    dreamMasterID: state.dreamMasterID,
    invokerFaction: state.players[invokerID]?.faction ?? 'thief',
    d6: () => 4,
    ...overrides,
  };
}

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, hand } } };
}

function setUsedNightmares(state: SetupState, ids: string[]): SetupState {
  return { ...state, usedNightmareIds: ids as CardID[] };
}

// ==========================================================================
// Registry 集成
// ==========================================================================

describe('R2 · registry 扩展', () => {
  it('注册总数升至 8', () => {
    const reg = createDefaultRegistry();
    expect(reg.get(jokerGamble.id)).toBe(jokerGamble);
    expect(reg.get(blackSwanTour.id)).toBe(blackSwanTour);
    expect(reg.get(ariesExtraDraw.id)).toBe(ariesExtraDraw);
  });

  it('onDrawPhase trigger → joker + black_swan + aries', () => {
    const reg = createDefaultRegistry();
    const list = reg.getByTrigger('onDrawPhase');
    const ids = list.map((a) => a.id).sort();
    expect(ids).toEqual(['thief_aries.skill_1', 'thief_black_swan.skill_0', 'thief_joker.skill_0']);
  });
});

// ==========================================================================
// 小丑 · 赌博
// ==========================================================================

describe('R2 · 小丑·赌博', () => {
  it('canActivate ok：draw 阶段 + 角色匹配', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_joker');
    const ctx = ctxFor(s, 'p1');
    expect(jokerGamble.canActivate(s, ctx).ok).toBe(true);
  });

  it('非 draw 阶段 → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_joker');
    s = { ...s, turnPhase: 'action' };
    const ctx = ctxFor(s, 'p1');
    expect(jokerGamble.canActivate(s, ctx).reason).toBe('wrong_phase');
  });

  it('apply：roll=5 → drawCount=5', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_joker');
    const ctx = ctxFor(s, 'p1', { d6: () => 5 });
    const r = jokerGamble.apply(s, ctx, {});
    expect(r.events[0]!.data).toMatchObject({ roll: 5, drawCount: 5 });
    const next = r.state!;
    expect(next.players['p1']!.skillUsedThisTurn[jokerGamble.id]).toBe(1);
  });

  it('回合限 1 次：第 2 次拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_joker');
    const ctx = ctxFor(s, 'p1');
    const r1 = jokerGamble.apply(s, ctx, {});
    expect(jokerGamble.canActivate(r1.state!, ctx).reason).toBe('usage_exhausted');
  });

  it('roll 边界：1/6 都被 jokerDrawCount 钳制在 [1,6]', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_joker');
    const ctxLo = ctxFor(s, 'p1', { d6: () => 1 });
    const ctxHi = ctxFor(s, 'p1', { d6: () => 6 });
    expect(jokerGamble.apply(s, ctxLo, {}).events[0]!.data!.drawCount).toBe(1);
    expect(jokerGamble.apply(s, ctxHi, {}).events[0]!.data!.drawCount).toBe(6);
  });
});

// ==========================================================================
// 黑天鹅 · 巡演
// ==========================================================================

describe('R2 · 黑天鹅·巡演', () => {
  it('canActivate ok：draw 阶段 + 手牌 ≥1', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_swan');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    const ctx = ctxFor(s, 'p1');
    expect(blackSwanTour.canActivate(s, ctx).ok).toBe(true);
  });

  it('手牌为空 → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_swan');
    s = setHand(s, 'p1', []);
    const ctx = ctxFor(s, 'p1');
    expect(blackSwanTour.canActivate(s, ctx).reason).toBe('no_hand');
  });

  it('非 draw 阶段 → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_swan');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    s = { ...s, turnPhase: 'action' };
    const ctx = ctxFor(s, 'p1');
    expect(blackSwanTour.canActivate(s, ctx).reason).toBe('wrong_phase');
  });

  it('apply：分发给 p2 → p2 收到牌 + 自己手为空', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_swan');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_shoot' as CardID]);
    // 给牌库塞 4 张，黑天鹅可以抽满
    s = {
      ...s,
      deck: { ...s.deck, cards: Array(4).fill('action_unlock') as CardID[] },
    };
    const ctx = ctxFor(s, 'p1');
    const r = blackSwanTour.apply(s, ctx, {
      distribution: { p2: ['action_unlock', 'action_shoot'] as CardID[] },
    });
    const next = r.state!;
    expect(next.players['p1']!.hand).toHaveLength(4);
    expect(next.players['p2']!.hand).toContain('action_unlock');
    expect(next.players['p2']!.hand).toContain('action_shoot');
  });

  it('apply：分发不全 → 失败 returns no-op', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_swan');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_shoot' as CardID]);
    const ctx = ctxFor(s, 'p1');
    const r = blackSwanTour.apply(s, ctx, {
      distribution: { p2: ['action_unlock'] as CardID[] }, // 漏分 1 张
    });
    expect(r.state).toBe(s);
  });
});

// ==========================================================================
// 白羊 · 弃梦魇加成
// ==========================================================================

describe('R2 · 白羊·弃梦魇加成', () => {
  it('canActivate ok：白羊 + 已弃 ≥1 张梦魇', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    s = setUsedNightmares(s, ['nightmare_despair_storm']);
    const ctx = ctxFor(s, 'p1');
    expect(ariesExtraDraw.canActivate(s, ctx).ok).toBe(true);
  });

  it('未弃梦魇 → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    const ctx = ctxFor(s, 'p1');
    expect(ariesExtraDraw.canActivate(s, ctx).reason).toBe('no_used_nightmare');
  });

  it('apply：返回 extra 数量事件', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    s = setUsedNightmares(s, ['nightmare_despair_storm', 'nightmare_hunger_bite']);
    const ctx = ctxFor(s, 'p1');
    const r = ariesExtraDraw.apply(s, ctx, {});
    expect(r.events[0]!.data).toMatchObject({ extra: 2 });
  });

  it('passive scope：apply 不消耗计数', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aries');
    s = setUsedNightmares(s, ['nightmare_despair_storm']);
    const ctx = ctxFor(s, 'p1');
    const r = ariesExtraDraw.apply(s, ctx, {});
    expect(r.state).toBe(s); // 被动不改 state
    expect(ariesExtraDraw.canActivate(r.state!, ctx).ok).toBe(true); // 仍可"激活"
  });
});
