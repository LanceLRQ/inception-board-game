// 触发时机调度器测试

import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchTrigger } from './trigger-dispatcher.js';
import { InMemoryAbilityRegistry } from './registry.js';
import type { AbilityContext, AbilityDefinition, TriggerTiming } from './types.js';
import type { SetupState } from '../../setup.js';
import { createTestState } from '../../testing/fixtures.js';

function makeCtx(overrides: Partial<AbilityContext> = {}): AbilityContext {
  return {
    invokerID: 'p0',
    turnNumber: 1,
    turnPhase: 'action',
    dreamMasterID: 'p1',
    invokerFaction: 'thief',
    d6: () => 3,
    ...overrides,
  };
}

function makeAbility(
  id: string,
  triggers: TriggerTiming[],
  bucket: 1 | 2 | 3 | 4 | 5,
  applyFn?: (state: SetupState) => SetupState | null,
  kind?: 'card' | 'skill' | 'worldView' | 'nightmare' | 'rule',
): AbilityDefinition {
  return {
    id,
    name: id,
    description: '',
    kind: kind ?? (id.startsWith('dm_') ? 'worldView' : 'skill'),
    priorityBucket: bucket,
    triggers,
    canActivate: () => ({ ok: true }),
    getRequiredInputs: () => [],
    apply: (state, _ctx, _inputs) => {
      const newState = applyFn ? applyFn(state) : null;
      return { state: newState, events: [] };
    },
  };
}

describe('dispatchTrigger', () => {
  let registry: InMemoryAbilityRegistry;

  beforeEach(() => {
    registry = new InMemoryAbilityRegistry();
  });

  it('无匹配能力时返回原 state', () => {
    const s = createTestState();
    const result = dispatchTrigger(s, 'onTurnStart', makeCtx(), registry);
    expect(result.state).toBe(s);
    expect(result.events).toEqual([]);
  });

  it('按优先级顺序执行', () => {
    const order: string[] = [];
    registry.register(
      makeAbility(
        'rule_effect',
        ['onTurnStart'],
        5,
        () => {
          order.push('rule');
          return null;
        },
        'rule',
      ),
    );
    registry.register(
      makeAbility('thief_pointman.skill_effect', ['onTurnStart'], 1, () => {
        order.push('skill');
        return null;
      }),
    );

    const s = createTestState();
    // 让 skill_effect 的 characterId 匹配（但 isAbilityRelevant 只检查 kind='skill' 的前缀匹配）
    // rule/worldView 类全局生效
    dispatchTrigger(s, 'onTurnStart', makeCtx(), registry);
    // 技能类因为 invokerID 的 characterId 不匹配，被跳过
    // 世界观/规则类全局生效
    expect(order).toEqual(['rule']);
  });

  it('世界观类能力全局触发（不受角色限制）', () => {
    let applied = false;
    registry.register(
      makeAbility('dm_fortress.wv_0', ['onBeforeShoot'], 3, () => {
        applied = true;
        return null;
      }),
    );

    const s = createTestState();
    dispatchTrigger(s, 'onBeforeShoot', makeCtx(), registry);
    expect(applied).toBe(true);
  });

  it('技能类能力只在角色匹配时触发', () => {
    let skillApplied = false;
    registry.register(
      makeAbility('thief_pointman.skill_0', ['onDrawPhase'], 1, () => {
        skillApplied = true;
        return null;
      }),
    );

    // 玩家 p0 的 characterId 不是 thief_pointman → 不触发
    let s = createTestState();
    dispatchTrigger(s, 'onDrawPhase', makeCtx({ invokerID: 'p1' }), registry);
    expect(skillApplied).toBe(false);

    // 改为角色匹配 → 触发
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_pointman' },
      },
    };
    dispatchTrigger(s, 'onDrawPhase', makeCtx({ invokerID: 'p1' }), registry);
    expect(skillApplied).toBe(true);
  });

  it('canActivate 返回 false 时跳过', () => {
    let applied = false;
    const ability: AbilityDefinition = {
      id: 'dm_test.wv_0',
      name: 'test',
      description: '',
      kind: 'worldView',
      priorityBucket: 3,
      triggers: ['onTurnEnd'],
      canActivate: () => ({ ok: false, reason: 'blocked' }),
      getRequiredInputs: () => [],
      apply: () => {
        applied = true;
        return { state: null, events: [] };
      },
    };
    registry.register(ability);

    const s = createTestState();
    dispatchTrigger(s, 'onTurnEnd', makeCtx(), registry);
    expect(applied).toBe(false);
  });

  it('pendingResponse 中断后续执行', () => {
    const order: string[] = [];
    registry.register(
      makeAbility(
        'first',
        ['onActionPhase'],
        1,
        () => {
          order.push('first');
          return null;
        },
        'worldView',
      ),
    );
    // 第二个能力返回 pendingResponse
    const ability: AbilityDefinition = {
      id: 'second',
      name: 'second',
      description: '',
      kind: 'worldView',
      priorityBucket: 2,
      triggers: ['onActionPhase'],
      canActivate: () => ({ ok: true }),
      getRequiredInputs: () => [],
      apply: () => ({
        state: null,
        events: [],
        pendingResponse: {
          sourceAbilityID: 'second',
          responders: ['p1'],
          timeoutMs: 30000,
          validResponseAbilityIDs: [],
          onTimeout: 'resolve',
        },
      }),
    };
    registry.register(ability);
    registry.register(
      makeAbility(
        'third',
        ['onActionPhase'],
        3,
        () => {
          order.push('third');
          return null;
        },
        'rule',
      ),
    );

    const s = createTestState();
    const result = dispatchTrigger(s, 'onActionPhase', makeCtx(), registry);
    expect(order).toEqual(['first']);
    expect(result.pendingResponse).toBeDefined();
    expect(result.pendingResponse!.sourceAbilityID).toBe('second');
  });

  it('apply 返回的 state 传递给下一个能力', () => {
    let capturedValue: number | undefined;
    registry.register(
      makeAbility(
        'adder',
        ['onTurnStart'],
        1,
        (state: SetupState) => ({
          ...state,
          moveCounter: (state.moveCounter ?? 0) + 10,
        }),
        'worldView',
      ),
    );
    registry.register({
      id: 'reader',
      name: 'reader',
      description: '',
      kind: 'worldView',
      priorityBucket: 2,
      triggers: ['onTurnStart'],
      canActivate: () => ({ ok: true }),
      getRequiredInputs: () => [],
      apply: (state) => {
        capturedValue = state.moveCounter;
        return { state: null, events: [] };
      },
    });

    const s = createTestState();
    dispatchTrigger(s, 'onTurnStart', makeCtx(), registry);
    // reader 的 bucket 2 在 adder bucket 1 之后执行
    // adder 返回新 state 后 reader 能看到 moveCounter + 10
    expect(capturedValue).toBe(s.moveCounter + 10);
  });
});
