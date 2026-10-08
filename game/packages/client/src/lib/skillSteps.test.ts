// 分步表单的纯函数：步骤表、各步骤的完成条件、参数拼装、回退时清空后面的选择。
// 与真实引擎的对账在 components/ActiveSkillPanel/skillEngineFlow.test.ts。

import { describe, expect, it } from 'vitest';
import {
  AQUARIUS_COHERENCE,
  EMPTY_PICKS,
  GREEN_RAY_ARREST,
  LUNA_FULL_MOON,
  MARS_KILL,
  MARTYR_SACRIFICE,
  PISCES_BLESSING,
  SAGITTARIUS_HEART_LOCK,
  VENUS_MIRROR_COPY,
  type ActiveSkillContext,
} from './activeSkills';
import {
  buildStepArgs,
  choicesFor,
  clearFrom,
  discardChoicesFor,
  handPickReady,
  isInstantStep,
  isStepSkill,
  nightmareKindAt,
  stepReady,
  stepsFor,
} from './skillSteps';

function ctx(over: Partial<ActiveSkillContext> = {}): ActiveSkillContext {
  return {
    characterId: 'thief_luna_back',
    turnPhase: 'action',
    isHumanTurn: true,
    isAlive: true,
    humanLayer: 2,
    masterLayer: 3,
    hasPending: false,
    skillUsedThisTurn: {},
    hand: ['action_kick', 'action_unlock'],
    faction: 'thief',
    seat: 'me',
    isDreamMaster: false,
    dreamMasterID: 'dm',
    ...over,
  };
}

describe('分步表单 · 哪些技能走它', () => {
  it('新增的参数形态都走分步表单；旧形态不走', () => {
    for (const skill of [
      LUNA_FULL_MOON,
      PISCES_BLESSING,
      GREEN_RAY_ARREST,
      AQUARIUS_COHERENCE,
      SAGITTARIUS_HEART_LOCK,
      VENUS_MIRROR_COPY,
      MARS_KILL,
    ]) {
      expect(isStepSkill(skill), skill.id).toBe(true);
    }
    expect(isStepSkill(MARTYR_SACRIFICE)).toBe(false);
  });
});

describe('分步表单 · 步骤', () => {
  it('每种形态的步骤顺序', () => {
    const kinds = (skill: Parameters<typeof stepsFor>[0]) =>
      stepsFor(skill, ctx(), EMPTY_PICKS).map((s) => s.kind);
    expect(kinds(LUNA_FULL_MOON)).toEqual(['handCards', 'players']);
    expect(kinds(PISCES_BLESSING)).toEqual(['players']);
    expect(kinds(GREEN_RAY_ARREST)).toEqual(['handCards', 'layer', 'players']);
    expect(kinds(SAGITTARIUS_HEART_LOCK)).toEqual(['choice', 'layer']);
    expect(kinds(AQUARIUS_COHERENCE)).toEqual(['discardCard']);
    expect(kinds(VENUS_MIRROR_COPY)).toEqual(['players', 'handCards']);
  });

  it('梦魇参数步骤只在选中的层上有要参数的梦魇时出现', () => {
    const c = ctx({
      layers: {
        1: {
          heartLockValue: 3,
          nightmareRevealed: true,
          nightmareTriggered: false,
          nightmareId: 'nightmare_plague',
          playersInLayer: [],
        },
        2: {
          heartLockValue: 3,
          nightmareRevealed: true,
          nightmareTriggered: false,
          nightmareId: 'nightmare_vortex',
          playersInLayer: [],
        },
        3: {
          heartLockValue: 3,
          nightmareRevealed: false,
          nightmareTriggered: false,
          nightmareId: null,
          playersInLayer: [],
        },
      },
    });
    const kinds = (layer: number | null) =>
      stepsFor(MARS_KILL, c, { ...EMPTY_PICKS, layer }).map((s) => s.kind);
    expect(kinds(null)).toEqual(['layer']);
    expect(kinds(1)).toEqual(['layer', 'nightmareParams']);
    expect(kinds(2)).toEqual(['layer']);
    // 盗梦者看不到梦魇是什么：按不需要参数处理
    expect(kinds(3)).toEqual(['layer']);
    expect(nightmareKindAt(c, 1)).toBe('plague');
    expect(nightmareKindAt(c, null)).toBe('none');
  });

  it('点一下就定的步骤：层、选一项、弃牌堆里的牌、必选的单个玩家', () => {
    expect(isInstantStep({ kind: 'layer' })).toBe(true);
    expect(isInstantStep({ kind: 'choice' })).toBe(true);
    expect(isInstantStep({ kind: 'discardCard' })).toBe(true);
    expect(isInstantStep({ kind: 'players' })).toBe(true);
    expect(isInstantStep({ kind: 'players', optional: true })).toBe(false);
    expect(isInstantStep({ kind: 'players', multi: true, optional: true })).toBe(false);
    expect(isInstantStep({ kind: 'handCards' })).toBe(false);
    expect(isInstantStep({ kind: 'nightmareParams' })).toBe(false);
  });
});

describe('分步表单 · 完成条件与参数拼装', () => {
  it('手牌：描述符给了张数就刚好这么多，否则至少 1 张', () => {
    expect(handPickReady({ pickCount: 2 }, 1)).toBe(false);
    expect(handPickReady({ pickCount: 2 }, 2)).toBe(true);
    expect(handPickReady({ pickCount: 2 }, 3)).toBe(false);
    expect(handPickReady({}, 0)).toBe(false);
    expect(handPickReady({}, 3)).toBe(true);
  });

  it('可不选的玩家步骤总是就绪；必选的要选 1 个', () => {
    const c = ctx();
    expect(stepReady({ kind: 'players', optional: true }, PISCES_BLESSING, c, EMPTY_PICKS)).toBe(
      true,
    );
    expect(stepReady({ kind: 'players' }, VENUS_MIRROR_COPY, c, EMPTY_PICKS)).toBe(false);
    expect(
      stepReady({ kind: 'players' }, VENUS_MIRROR_COPY, c, { ...EMPTY_PICKS, players: ['a'] }),
    ).toBe(true);
  });

  it('参数拼装：手牌位置换成牌 id，顺序与引擎的入参一致', () => {
    const c = ctx({ hand: ['action_shoot', 'action_kick', 'action_unlock'] });
    expect(
      buildStepArgs(LUNA_FULL_MOON, c, { ...EMPTY_PICKS, cards: [2, 1], players: ['a', 'b'] }),
    ).toEqual([
      ['action_unlock', 'action_kick'],
      ['a', 'b'],
    ]);
    expect(buildStepArgs(PISCES_BLESSING, c, { ...EMPTY_PICKS, players: ['a'] })).toEqual(['a']);
    expect(buildStepArgs(PISCES_BLESSING, c, EMPTY_PICKS)).toEqual([null]);
    expect(
      buildStepArgs(GREEN_RAY_ARREST, c, { ...EMPTY_PICKS, cards: [0], layer: 3, players: ['t'] }),
    ).toEqual(['action_shoot', 't', 3]);
    expect(
      buildStepArgs(SAGITTARIUS_HEART_LOCK, c, { ...EMPTY_PICKS, layer: 4, choice: 'increase' }),
    ).toEqual([4, 1]);
    expect(
      buildStepArgs(SAGITTARIUS_HEART_LOCK, c, { ...EMPTY_PICKS, layer: 4, choice: 'decrease' }),
    ).toEqual([4, -1]);
    expect(
      buildStepArgs(AQUARIUS_COHERENCE, c, { ...EMPTY_PICKS, discardCard: 'action_unlock' }),
    ).toEqual(['action_unlock']);
    expect(
      buildStepArgs(VENUS_MIRROR_COPY, c, { ...EMPTY_PICKS, players: ['a'], cards: [1, 2] }),
    ).toEqual(['a', ['action_kick', 'action_unlock']]);
  });

  it('还有没完成的步骤时拼不出参数', () => {
    const c = ctx();
    expect(buildStepArgs(LUNA_FULL_MOON, c, { ...EMPTY_PICKS, cards: [0] })).toBeNull();
    expect(buildStepArgs(GREEN_RAY_ARREST, c, { ...EMPTY_PICKS, cards: [0] })).toBeNull();
    expect(buildStepArgs(SAGITTARIUS_HEART_LOCK, c, { ...EMPTY_PICKS, layer: 1 })).toBeNull();
    expect(buildStepArgs(AQUARIUS_COHERENCE, c, EMPTY_PICKS)).toBeNull();
    expect(buildStepArgs(MARTYR_SACRIFICE, c, EMPTY_PICKS)).toBeNull();
  });

  it('梦魇附加参数：不需要参数时参数里只有层；要参数而没选完时拼不出', () => {
    const c = ctx({
      layers: {
        1: {
          heartLockValue: 3,
          nightmareRevealed: true,
          nightmareTriggered: false,
          nightmareId: 'nightmare_echo',
          playersInLayer: [],
        },
        2: {
          heartLockValue: 3,
          nightmareRevealed: true,
          nightmareTriggered: false,
          nightmareId: 'nightmare_vortex',
          playersInLayer: [],
        },
      },
    });
    expect(buildStepArgs(MARS_KILL, c, { ...EMPTY_PICKS, layer: 2 })).toEqual([2]);
    expect(buildStepArgs(MARS_KILL, c, { ...EMPTY_PICKS, layer: 1 }, false)).toBeNull();
    expect(
      buildStepArgs(
        MARS_KILL,
        c,
        { ...EMPTY_PICKS, layer: 1, params: { targetLayer: 3, action: 'add' } },
        true,
      ),
    ).toEqual([1, { targetLayer: 3, action: 'add' }]);
  });
});

describe('分步表单 · 选项与回退', () => {
  it('弃牌堆步骤：本回合用过的牌不列，同名合并并带张数', () => {
    const c = ctx({
      discardPile: ['action_kick', 'action_unlock', 'action_unlock', 'action_shoot'],
      playedCards: ['action_kick', 'action_kick'],
    });
    expect(discardChoicesFor(AQUARIUS_COHERENCE, c)).toEqual([
      { card: 'action_unlock', count: 2 },
      { card: 'action_shoot', count: 1 },
    ]);
  });

  it('射手·穿心的选项：解封次数用尽时减少置灰并说明', () => {
    const open = choicesFor(SAGITTARIUS_HEART_LOCK, ctx());
    expect(open.map((c) => [c.value, c.disabled])).toEqual([
      ['increase', null],
      ['decrease', null],
    ]);
    const spent = choicesFor(SAGITTARIUS_HEART_LOCK, ctx({ unlockExhausted: true }));
    expect(spent.find((c) => c.value === 'decrease')!.disabled).toEqual({
      key: 'skill.reason.unlockLimit',
    });
  });

  it('回退到第 n 步：这一步和之后的选择清空，之前的保留', () => {
    const steps = stepsFor(GREEN_RAY_ARREST, ctx(), EMPTY_PICKS);
    const picks = { ...EMPTY_PICKS, cards: [0], layer: 3, players: ['t'] };
    expect(clearFrom(steps, 1, picks)).toEqual({ ...EMPTY_PICKS, cards: [0] });
    expect(clearFrom(steps, 2, picks)).toEqual({ ...EMPTY_PICKS, cards: [0], layer: 3 });
    expect(clearFrom(steps, 0, picks)).toEqual(EMPTY_PICKS);
    expect(clearFrom(steps, 3, picks)).toEqual(picks);
  });

  it('回退时梦魇参数一并清空', () => {
    const c = ctx({
      layers: {
        1: {
          heartLockValue: 3,
          nightmareRevealed: true,
          nightmareTriggered: false,
          nightmareId: 'nightmare_echo',
          playersInLayer: [],
        },
      },
    });
    const steps = stepsFor(MARS_KILL, c, { ...EMPTY_PICKS, layer: 1 });
    const picks = { ...EMPTY_PICKS, layer: 1, params: { targetLayer: 2, action: 'add' } };
    expect(clearFrom(steps, 1, picks).params).toBeNull();
    expect(clearFrom(steps, 1, picks).layer).toBe(1);
  });
});
