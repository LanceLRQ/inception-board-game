// W10-R1 · 桶 A+B 5 角色 AbilityDefinition 注册 + canActivate/apply 行为测试
// 对照：plans/tasks.md Phase 3 abilities registry · R1（处女/雅典娜急智/水瓶/意念判官/双鱼）

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from '../../../../setup.js';
import { scenarioStartOfGame3p } from '../../../../testing/scenarios.js';
import {
  ALL_THIEF_ABILITIES,
  athenaWit,
  aquariusUnlimited,
  createDefaultRegistry,
  piscesEvade,
  sudgerVerdict,
  virgoPerfect,
} from '../index.js';
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

function pushDiscard(state: SetupState, cards: CardID[]): SetupState {
  return { ...state, deck: { ...state.deck, discardPile: [...state.deck.discardPile, ...cards] } };
}

function setLayer(state: SetupState, playerID: string, layer: Layer): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, currentLayer: layer } } };
}

// ==========================================================================
// Registry 集成
// ==========================================================================

describe('R1 · createDefaultRegistry', () => {
  it('注册全部 5 个 thief 能力', () => {
    const reg = createDefaultRegistry();
    expect(ALL_THIEF_ABILITIES.length).toBeGreaterThanOrEqual(5);
    for (const a of ALL_THIEF_ABILITIES) {
      expect(reg.get(a.id)).toBe(a);
    }
  });

  it('按角色检索：thief_virgo → 1 个', () => {
    const reg = createDefaultRegistry();
    const list = reg.getByCharacter('thief_virgo');
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('thief_virgo.skill_0');
  });

  it('按 trigger 检索：onBeforeShoot → 含 sudger + pisces', () => {
    const reg = createDefaultRegistry();
    const ids = reg.getByTrigger('onBeforeShoot').map((a) => a.id);
    expect(ids).toContain('thief_pisces.skill_0');
    expect(ids).toContain('thief_sudger_of_mind.skill_0');
  });

  it('按 trigger 检索：onAfterShoot → virgo', () => {
    const reg = createDefaultRegistry();
    const list = reg.getByTrigger('onAfterShoot');
    expect(list.map((a) => a.id)).toEqual(['thief_virgo.skill_0']);
  });

  it('按 trigger 检索：onActionPhase → athenaWit', () => {
    const reg = createDefaultRegistry();
    const list = reg.getByTrigger('onActionPhase');
    expect(list.map((a) => a.id)).toContain('thief_athena.skill_0');
  });

  it('按 trigger 检索：passive → aquarius', () => {
    const reg = createDefaultRegistry();
    const list = reg.getByTrigger('passive');
    expect(list.map((a) => a.id)).toContain('thief_aquarius.skill_1');
  });
});

// ==========================================================================
// 处女 · 完美
// ==========================================================================

describe('R1 · 处女·完美 (W20.5 实装)', () => {
  it('canActivate ok：角色匹配 + lastShootRoll=6', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = { ...s, lastShootRoll: 6 };
    const ctx = ctxFor(s, 'p1');
    expect(virgoPerfect.canActivate(s, ctx).ok).toBe(true);
  });

  it('roll≠6 → 不可发动', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = { ...s, lastShootRoll: 5 };
    const ctx = ctxFor(s, 'p1');
    const r = virgoPerfect.canActivate(s, ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('condition_not_met');
  });

  it('非处女角色 → 不可发动', () => {
    const s = { ...scenarioStartOfGame3p(), lastShootRoll: 6 };
    const ctx = ctxFor(s, 'p1');
    expect(virgoPerfect.canActivate(s, ctx).ok).toBe(false);
  });

  it('无 lastShootRoll → 不可发动', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_virgo');
    const ctx = ctxFor(s, 'p1');
    expect(virgoPerfect.canActivate(s, ctx).ok).toBe(false);
  });

  it('已挂起 pendingVirgoChoice → 不重入', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = {
      ...s,
      lastShootRoll: 6,
      pendingVirgoChoice: { virgoID: 'p1', triggerRoll: 6, shooterID: 'p2' },
    };
    const ctx = ctxFor(s, 'p1');
    const r = virgoPerfect.canActivate(s, ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('already_pending');
  });

  it('apply 挂起 pendingVirgoChoice + 触发事件', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = { ...s, lastShootRoll: 6, currentPlayerID: 'p2' };
    const ctx = ctxFor(s, 'p1');
    const r = virgoPerfect.apply(s, ctx, {});
    expect(r.state).not.toBeNull();
    expect(r.state!.pendingVirgoChoice).toEqual({
      virgoID: 'p1',
      triggerRoll: 6,
      shooterID: 'p2',
    });
    expect(r.events.map((e) => e.type)).toContain('virgo_perfect_pending');
  });
});

// ==========================================================================
// 雅典娜 · 急智
// ==========================================================================

describe('R1 · 雅典娜·急智', () => {
  it('canActivate ok：角色匹配 + 弃牌堆非空 + 未用过', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_athena');
    s = pushDiscard(s, ['action_unlock' as CardID]);
    const ctx = ctxFor(s, 'p1');
    expect(athenaWit.canActivate(s, ctx).ok).toBe(true);
  });

  it('弃牌堆为空 → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_athena');
    const ctx = ctxFor(s, 'p1');
    expect(athenaWit.canActivate(s, ctx).reason).toBe('discard_empty');
  });

  it('apply：抽 1 张 + 计数 +1', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_athena');
    s = pushDiscard(s, ['action_unlock' as CardID]);
    const ctx = ctxFor(s, 'p1');
    const r = athenaWit.apply(s, ctx, {});
    expect(r.state).not.toBe(s);
    const next = r.state!;
    expect(next.players['p1']!.hand).toContain('action_unlock');
    expect(next.deck.discardPile).toHaveLength(0);
    expect(next.players['p1']!.skillUsedThisTurn[athenaWit.id]).toBe(1);
    expect(r.events).toHaveLength(1);
  });

  it('回合限 1 次：第 2 次发动被拒', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_athena');
    s = pushDiscard(s, ['action_unlock' as CardID, 'action_shoot' as CardID]);
    const ctx = ctxFor(s, 'p1');
    const r1 = athenaWit.apply(s, ctx, {});
    const next = r1.state!;
    expect(athenaWit.canActivate(next, ctx).reason).toBe('usage_exhausted');
  });
});

// ==========================================================================
// 水瓶 · 解封无限（被动）
// ==========================================================================

describe('R1 · 水瓶·解封无限（被动）', () => {
  it('角色匹配 → 被动 active', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    const ctx = ctxFor(s, 'p1');
    expect(aquariusUnlimited.canActivate(s, ctx).ok).toBe(true);
  });

  it('非水瓶 → inactive', () => {
    const s = scenarioStartOfGame3p();
    const ctx = ctxFor(s, 'p1');
    expect(aquariusUnlimited.canActivate(s, ctx).ok).toBe(false);
  });

  it('apply 被动：state 不变', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_aquarius');
    const ctx = ctxFor(s, 'p1');
    const r = aquariusUnlimited.apply(s, ctx, {});
    expect(r.state).toBe(s);
  });
});

// ==========================================================================
// 意念判官 · 定罪
// ==========================================================================

describe('R1 · 意念判官·定罪', () => {
  it('canActivate ok：角色匹配 + 是 shooter', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_sudger_of_mind');
    const ctx = ctxFor(s, 'p1', {
      pendingShoot: {
        shooterID: 'p1',
        targetID: 'p2',
        cardID: 'action_shoot',
        baseRoll: 3,
        modifiers: [],
      },
    });
    expect(sudgerVerdict.canActivate(s, ctx).ok).toBe(true);
  });

  it('非 shooter → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_sudger_of_mind');
    const ctx = ctxFor(s, 'p1', {
      pendingShoot: {
        shooterID: 'p2',
        targetID: 'p1',
        cardID: 'action_shoot',
        baseRoll: 3,
        modifiers: [],
      },
    });
    expect(sudgerVerdict.canActivate(s, ctx).reason).toBe('not_shooter');
  });

  it('apply：pick=B 返回 rollB（用 d6 注入）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_sudger_of_mind');
    const ctx = ctxFor(s, 'p1', {
      pendingShoot: {
        shooterID: 'p1',
        targetID: 'p2',
        cardID: 'action_shoot',
        baseRoll: 3,
        modifiers: [],
      },
      d6: () => 5,
    });
    const r = sudgerVerdict.apply(s, ctx, { pick: 'B' });
    expect(r.events[0]!.data).toMatchObject({ rollA: 3, rollB: 5, pick: 'B', final: 5 });
  });

  it('apply：pick=A 返回 rollA', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_sudger_of_mind');
    const ctx = ctxFor(s, 'p1', {
      pendingShoot: {
        shooterID: 'p1',
        targetID: 'p2',
        cardID: 'action_shoot',
        baseRoll: 4,
        modifiers: [],
      },
      d6: () => 6,
    });
    const r = sudgerVerdict.apply(s, ctx, { pick: 'A' });
    expect(r.events[0]!.data).toMatchObject({ rollA: 4, rollB: 6, pick: 'A', final: 4 });
  });
});

// ==========================================================================
// 双鱼 · 闪避
// ==========================================================================

describe('R1 · 双鱼·闪避', () => {
  it('canActivate ok：双鱼 + 当前层>1 + 是 target', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = setLayer(s, 'p1', 3 as Layer);
    const ctx = ctxFor(s, 'p1', {
      pendingShoot: {
        shooterID: 'p2',
        targetID: 'p1',
        cardID: 'action_shoot',
        baseRoll: 3,
        modifiers: [],
      },
    });
    expect(piscesEvade.canActivate(s, ctx).ok).toBe(true);
  });

  it('当前层=1 → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = setLayer(s, 'p1', 1 as Layer);
    const ctx = ctxFor(s, 'p1', {
      pendingShoot: {
        shooterID: 'p2',
        targetID: 'p1',
        cardID: 'action_shoot',
        baseRoll: 3,
        modifiers: [],
      },
    });
    expect(piscesEvade.canActivate(s, ctx).ok).toBe(false);
  });

  it('非 target → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = setLayer(s, 'p1', 3 as Layer);
    const ctx = ctxFor(s, 'p1', {
      pendingShoot: {
        shooterID: 'p1',
        targetID: 'p2',
        cardID: 'action_shoot',
        baseRoll: 3,
        modifiers: [],
      },
    });
    expect(piscesEvade.canActivate(s, ctx).reason).toBe('not_target');
  });

  it('apply：移到上一层 + 翻面', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = setLayer(s, 'p1', 3 as Layer);
    const ctx = ctxFor(s, 'p1', {
      pendingShoot: {
        shooterID: 'p2',
        targetID: 'p1',
        cardID: 'action_shoot',
        baseRoll: 3,
        modifiers: [],
      },
    });
    const r = piscesEvade.apply(s, ctx, {});
    const next = r.state!;
    expect(next.players['p1']!.currentLayer).toBe(2);
    // 翻面后 characterId 应变为 thief_pisces_b（或类似），至少不等于原 id
    expect(next.players['p1']!.characterId).not.toBe('thief_pisces');
    expect(r.events[0]!.type).toBe('pisces_evade_resolved');
  });
});
