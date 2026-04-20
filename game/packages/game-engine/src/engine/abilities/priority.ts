// 优先级仲裁引擎 — 黄金定律
// 对照：plans/design/05-card-system.md §5.3
// 规则：技能(bucket 1) > 行动牌(2) > 世界观(3) > 梦魇(4) > 规则(5)

import type { EffectStackFrame } from './types.js';

type PendingShootContext = import('./types.js').PendingShootContext;

/**
 * 按黄金定律排序效果栈
 * - 不同 bucket：数字小的先执行（技能 > 行动牌 > 世界观 > ...）
 * - 同 bucket：按发动者回合顺序先到先执行
 */
export function arbitrate(frames: EffectStackFrame[]): EffectStackFrame[] {
  return [...frames].sort((a, b) => {
    if (a.priorityBucket !== b.priorityBucket) return a.priorityBucket - b.priorityBucket;
    return a.invokerTurnOrder - b.invokerTurnOrder;
  });
}

/**
 * 解析 SHOOT 骰子修饰器链
 * - override 型（灵雕师·雕琢）优先级最高，直接返回绝对值
 * - 否则按黄金定律排序后累加所有 delta
 * - 最终 clamp 到 [1, 6]
 */
export function resolveDiceModifiers(ctx: PendingShootContext): number {
  const modifiers = ctx.modifiers;

  // 检查是否存在 override：按 bucket 升序取第一个 override
  const overrides = modifiers
    .filter((m) => m.kind === 'override')
    .sort((a, b) => a.bucket - b.bucket);

  if (overrides.length > 0) {
    return clamp(overrides[0]!.absoluteValue ?? 1);
  }

  // 累加所有 delta（按优先级排序，但 delta 是可加的所以顺序无关）
  const deltaSum = modifiers
    .filter((m) => m.kind === 'delta' && m.delta !== undefined)
    .reduce((sum, m) => sum + (m.delta ?? 0), 0);

  return clamp(ctx.baseRoll + deltaSum);
}

/** 将骰值限制在 [1, 6] */
function clamp(value: number): number {
  return Math.max(1, Math.min(6, value));
}
