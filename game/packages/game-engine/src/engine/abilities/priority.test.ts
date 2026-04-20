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

// ============================================================================
// R25 · 黄金定律优先级仲裁测试矩阵（Phase 3 W19）
// 对照：plans/design/05-card-system.md §5.3 + plans/tasks.md W19
// ============================================================================
describe('arbitrate · 矩阵（R25 · W19 黄金定律）', () => {
  it('5 个 bucket 全部齐全：返回严格升序', () => {
    const frames = [
      makeFrame('r1', 5, 0),
      makeFrame('s2', 1, 1),
      makeFrame('nm', 4, 2),
      makeFrame('ac', 2, 3),
      makeFrame('wv', 3, 4),
      makeFrame('s1', 1, 0),
    ];
    const sorted = arbitrate(frames);
    expect(sorted.map((f) => f.abilityID)).toEqual(['s1', 's2', 'ac', 'wv', 'nm', 'r1']);
  });

  it('每个 bucket 内多个同级：按 turnOrder 稳定排序', () => {
    const frames = [
      makeFrame('s-p3', 1, 3),
      makeFrame('c-p2', 2, 2),
      makeFrame('s-p1', 1, 1),
      makeFrame('c-p1', 2, 1),
      makeFrame('s-p2', 1, 2),
    ];
    const sorted = arbitrate(frames);
    // bucket 1 三条按 turnOrder 1,2,3；bucket 2 两条按 1,2
    expect(sorted.map((f) => f.abilityID)).toEqual(['s-p1', 's-p2', 's-p3', 'c-p1', 'c-p2']);
  });

  it('同 bucket 同 turnOrder：保持原输入顺序（JS Array.sort 稳定）', () => {
    const frames = [makeFrame('first', 1, 0), makeFrame('second', 1, 0), makeFrame('third', 1, 0)];
    const sorted = arbitrate(frames);
    expect(sorted.map((f) => f.abilityID)).toEqual(['first', 'second', 'third']);
  });

  it('幂等：多次排序结果稳定', () => {
    const frames = [
      makeFrame('a', 3, 2),
      makeFrame('b', 1, 4),
      makeFrame('c', 2, 1),
      makeFrame('d', 4, 0),
    ];
    const once = arbitrate(frames);
    const twice = arbitrate(once);
    expect(once).toEqual(twice);
  });

  it('负 turnOrder 处理（防御性）', () => {
    const frames = [makeFrame('a', 1, -1), makeFrame('b', 1, 0), makeFrame('c', 1, 1)];
    const sorted = arbitrate(frames);
    expect(sorted.map((f) => f.abilityID)).toEqual(['a', 'b', 'c']);
  });
});

describe('resolveDiceModifiers · 矩阵（R25 · W19 SHOOT 修饰链）', () => {
  function makeCtx(baseRoll: number, modifiers: DiceModifierEntry[]): PendingShootContext {
    return {
      shooterID: 'p0',
      targetID: 'p1',
      cardID: 'action_shoot',
      baseRoll,
      modifiers,
    };
  }

  it('5 bucket 全部 delta 同时存在：全部累加后 clamp', () => {
    // base 3 + skill(-1) + card(+2) + world(-1) + nm(+1) + rule(-1) = 3
    const ctx = makeCtx(3, [
      { source: 'skill', sourceID: 's', kind: 'delta', delta: -1, bucket: 1 },
      { source: 'card', sourceID: 'c', kind: 'delta', delta: 2, bucket: 2 },
      { source: 'worldView', sourceID: 'wv', kind: 'delta', delta: -1, bucket: 3 },
      { source: 'nightmare', sourceID: 'nm', kind: 'delta', delta: 1, bucket: 4 },
      { source: 'rule', sourceID: 'r', kind: 'delta', delta: -1, bucket: 5 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(3);
  });

  it('override 出现时忽略所有 delta（无论 bucket）', () => {
    // base 4 + 大量 delta 但 skill override=2 → 2
    const ctx = makeCtx(4, [
      { source: 'card', sourceID: 'c', kind: 'delta', delta: 3, bucket: 2 },
      { source: 'worldView', sourceID: 'w', kind: 'delta', delta: -5, bucket: 3 },
      { source: 'skill', sourceID: 'so', kind: 'override', absoluteValue: 2, bucket: 1 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(2);
  });

  it('多 override 跨 bucket：最低 bucket 胜（skill 1 > worldView 3 > rule 5）', () => {
    const ctx = makeCtx(3, [
      { source: 'rule', sourceID: 'r', kind: 'override', absoluteValue: 2, bucket: 5 },
      { source: 'worldView', sourceID: 'w', kind: 'override', absoluteValue: 4, bucket: 3 },
      { source: 'skill', sourceID: 's', kind: 'override', absoluteValue: 6, bucket: 1 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(6);
  });

  it('空 delta（delta=0）不影响结果', () => {
    const ctx = makeCtx(3, [
      { source: 'skill', sourceID: 's', kind: 'delta', delta: 0, bucket: 1 },
      { source: 'card', sourceID: 'c', kind: 'delta', delta: 0, bucket: 2 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(3);
  });

  it('delta 正负平衡：总和为 0', () => {
    const ctx = makeCtx(3, [
      { source: 'skill', sourceID: 'pos', kind: 'delta', delta: 2, bucket: 1 },
      { source: 'rule', sourceID: 'neg', kind: 'delta', delta: -2, bucket: 5 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(3);
  });

  it('delta 超大正向：clamp 到 6', () => {
    const ctx = makeCtx(3, [
      { source: 'skill', sourceID: 'big', kind: 'delta', delta: 100, bucket: 1 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(6);
  });

  it('override absoluteValue 为 undefined 时默认 1（防御性）', () => {
    const ctx = makeCtx(5, [{ source: 'skill', sourceID: 'bad', kind: 'override', bucket: 1 }]);
    // clamp(undefined ?? 1) = 1
    expect(resolveDiceModifiers(ctx)).toBe(1);
  });

  it('只有 override 无 delta：完全忽略 baseRoll', () => {
    const ctx = makeCtx(6, [
      { source: 'skill', sourceID: 'o', kind: 'override', absoluteValue: 3, bucket: 1 },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(3);
  });

  it('典型交互：灵雕师 + 要塞 + M4 + 恐怖分子 → override 优先', () => {
    // 05-card-system.md §5.3.2 核心场景
    // 灵雕师·雕琢 override = target.hand.length = 3
    // 要塞世界观 delta -1 / M4 delta -1 / 恐怖分子 delta -1
    // override 优先 → 3（忽略所有 delta）
    const ctx = makeCtx(4, [
      { source: 'worldView', sourceID: 'fortress', kind: 'delta', delta: -1, bucket: 3 },
      { source: 'rule', sourceID: 'm4', kind: 'delta', delta: -1, bucket: 5 },
      { source: 'skill', sourceID: 'terr', kind: 'delta', delta: -1, bucket: 1 },
      {
        source: 'skill',
        sourceID: 'soul_sculptor.carve',
        kind: 'override',
        absoluteValue: 3,
        bucket: 1,
      },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(3);
  });

  it('典型交互：木星·雷霆 override = 1（kill） vs 哈雷 delta -2 → override 胜', () => {
    // 木星 override absoluteValue = 1（强制 kill 面）
    // 哈雷 delta -2（会把 baseRoll 6 削到 4）
    const ctx = makeCtx(6, [
      { source: 'skill', sourceID: 'haley.impact', kind: 'delta', delta: -2, bucket: 1 },
      {
        source: 'worldView',
        sourceID: 'jupiter.thunder',
        kind: 'override',
        absoluteValue: 1,
        bucket: 3,
      },
    ]);
    expect(resolveDiceModifiers(ctx)).toBe(1);
  });
});
