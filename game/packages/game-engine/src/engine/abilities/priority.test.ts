// 优先级仲裁引擎测试
// 对照：plans/design/05-card-system.md §5.3 黄金定律

import { describe, it, expect } from 'vitest';
import { arbitrate, resolveDiceModifiers } from './priority.js';
import type { EffectStackFrame, DiceModifierEntry, PendingShootContext } from './types.js';

// 辅助：构建一个最小 stack frame
function makeFrame(id: string, bucket: 1 | 2 | 3 | 4 | 5, turnOrder: number): EffectStackFrame {
  return {
    abilityID: id,
    abilityKind: 'skill',
    priorityBucket: bucket,
    invokerID: `p${turnOrder}`,
    invokerTurnOrder: turnOrder,
    apply: () => ({ state: null, events: [] }),
  };
}

describe('arbitrate', () => {
  it('按黄金定律排序：bucket 升序', () => {
    const frames = [
      makeFrame('rule', 5, 0),
      makeFrame('nightmare', 4, 1),
      makeFrame('worldView', 3, 2),
      makeFrame('card', 2, 3),
      makeFrame('skill', 1, 4),
    ];
    const sorted = arbitrate(frames);
    expect(sorted.map((f) => f.abilityID)).toEqual([
      'skill',
      'card',
      'worldView',
      'nightmare',
      'rule',
    ]);
  });

  it('同 bucket 内按回合顺序排列', () => {
    const frames = [makeFrame('c', 1, 5), makeFrame('a', 1, 1), makeFrame('b', 1, 3)];
    const sorted = arbitrate(frames);
    expect(sorted.map((f) => f.abilityID)).toEqual(['a', 'b', 'c']);
  });

  it('不修改原数组', () => {
    const frames = [makeFrame('b', 2, 0), makeFrame('a', 1, 0)];
    const sorted = arbitrate(frames);
    expect(frames[0]!.abilityID).toBe('b');
    expect(sorted[0]!.abilityID).toBe('a');
  });

  it('空数组返回空', () => {
    expect(arbitrate([])).toEqual([]);
  });

  it('单一元素直接返回', () => {
    const frames = [makeFrame('only', 3, 0)];
    const sorted = arbitrate(frames);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]!.abilityID).toBe('only');
  });
});

describe('resolveDiceModifiers', () => {
  function makeCtx(baseRoll: number, modifiers: DiceModifierEntry[]): PendingShootContext {
    return {
      shooterID: 'p0',
      targetID: 'p1',
      cardID: 'action_shoot',
      baseRoll,
      modifiers,
    };
  }

  it('无修饰器返回原始值', () => {
    const ctx = makeCtx(4, []);
    expect(resolveDiceModifiers(ctx)).toBe(4);
  });

  it('delta 累加', () => {
    const ctx = makeCtx(4, [
      { source: 'rule', sourceID: 'm4_carbine', kind: 'delta', delta: -1, bucket: 5 },
      { source: 'worldView', sourceID: 'fortress', kind: 'delta', delta: -1, bucket: 3 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(2);
  });

  it('clamp 下界为 1', () => {
    const ctx = makeCtx(1, [
      { source: 'skill', sourceID: 'terrorist.kuangRe', kind: 'delta', delta: -2, bucket: 1 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(1);
  });

  it('clamp 上界为 6', () => {
    const ctx = makeCtx(6, [
      { source: 'skill', sourceID: 'test.bonus', kind: 'delta', delta: 3, bucket: 1 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(6);
  });

  it('override 优先于 delta', () => {
    const ctx = makeCtx(3, [
      { source: 'worldView', sourceID: 'fortress', kind: 'delta', delta: -1, bucket: 3 },
      {
        source: 'skill',
        sourceID: 'soul_sculptor.carve',
        kind: 'override',
        absoluteValue: 5,
        bucket: 1,
      },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(5);
  });

  it('多个 override 取最低 bucket（最高优先级）的值', () => {
    const ctx = makeCtx(3, [
      {
        source: 'nightmare',
        sourceID: 'test.override',
        kind: 'override',
        absoluteValue: 2,
        bucket: 4,
      },
      {
        source: 'skill',
        sourceID: 'test.skill_override',
        kind: 'override',
        absoluteValue: 6,
        bucket: 1,
      },
    ]);
    // bucket 1 优先级最高，取 6
    expect(resolveDiceModifiers(ctx)).toBe(6);
  });

  it('override 值也被 clamp', () => {
    const ctx = makeCtx(3, [
      { source: 'skill', sourceID: 'test.over', kind: 'override', absoluteValue: 99, bucket: 1 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(6);
  });

  it('override 值低于 1 也被 clamp', () => {
    const ctx = makeCtx(3, [
      { source: 'skill', sourceID: 'test.over', kind: 'override', absoluteValue: -3, bucket: 1 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(1);
  });

  it('典型场景：灵雕师 vs 要塞世界观', () => {
    // 对照 05-card-system.md §5.3.2
    // 灵雕师 override = target.hand.length = 4；要塞 delta = -1
    // override 优先，返回 4
    const ctx = makeCtx(3, [
      { source: 'worldView', sourceID: 'fortress', kind: 'delta', delta: -1, bucket: 3 },
      {
        source: 'skill',
        sourceID: 'soul_sculptor.carve',
        kind: 'override',
        absoluteValue: 4,
        bucket: 1,
      },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(4);
  });

  it('典型场景：M4 + 恐怖分子 + 哈雷', () => {
    // 基础 4 + M4(-1) + 恐怖分子(-1) + 哈雷(-2) = 0 → clamp 1
    const ctx = makeCtx(4, [
      { source: 'rule', sourceID: 'm4_carbine', kind: 'delta', delta: -1, bucket: 5 },
      { source: 'skill', sourceID: 'terrorist.kuangRe', kind: 'delta', delta: -1, bucket: 1 },
      { source: 'skill', sourceID: 'harley.impact', kind: 'delta', delta: -2, bucket: 1 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(1);
  });
});
