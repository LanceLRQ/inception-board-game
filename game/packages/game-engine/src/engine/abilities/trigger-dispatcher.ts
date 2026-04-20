// 触发时机调度器 — 统一调度 12 种 TriggerTiming
// 对照：plans/design/05-card-system.md §5.1 + 00-overview.md §0.4

import type { SetupState } from '../../setup.js';
import type {
  TriggerTiming,
  AbilityContext,
  AbilityDefinition,
  EffectStackFrame,
} from './types.js';
import type { InMemoryAbilityRegistry } from './registry.js';
import { arbitrate } from './priority.js';

export interface TriggerDispatchResult {
  state: SetupState;
  events: Array<{ type: string; playerID: string; data?: Record<string, unknown> }>;
  /** 需要等待响应的能力（第一个） */
  pendingResponse?: {
    sourceAbilityID: string;
    responders: string[];
    timeoutMs: number;
    validResponseAbilityIDs: string[];
    onTimeout: 'resolve' | 'cancel';
  };
}

/**
 * 触发指定时机的所有能力
 * 按黄金定律排序后依次执行；遇到 pendingResponse 则中断
 */
export function dispatchTrigger(
  state: SetupState,
  timing: TriggerTiming,
  ctx: AbilityContext,
  registry: InMemoryAbilityRegistry,
): TriggerDispatchResult {
  const abilities = registry.getByTrigger(timing);
  if (abilities.length === 0) {
    return { state, events: [] };
  }

  // 为每个活跃能力构建 EffectStackFrame
  const frames: EffectStackFrame[] = [];
  for (const ability of abilities) {
    // 跳过非当前玩家关联的主动技能（被动技能对全体生效）
    if (timing !== 'passive' && !isAbilityRelevant(ability, state, ctx)) {
      continue;
    }

    const validation = ability.canActivate(state, ctx);
    if (!validation.ok) continue;

    frames.push({
      abilityID: ability.id,
      abilityKind: ability.kind,
      priorityBucket: ability.priorityBucket,
      invokerID: ctx.invokerID,
      invokerTurnOrder: state.playerOrder.indexOf(ctx.invokerID),
      apply: (s, c) => ability.apply(s, c, {}),
    });
  }

  // 黄金定律排序
  const sorted = arbitrate(frames);

  let currentState = state;
  const allEvents: TriggerDispatchResult['events'] = [];
  let pending: TriggerDispatchResult['pendingResponse'];

  for (const frame of sorted) {
    const result = frame.apply(currentState, ctx);
    if (result.state) {
      currentState = result.state;
    }
    allEvents.push(...result.events);

    // 遇到需要响应的能力则中断
    if (result.pendingResponse) {
      pending = result.pendingResponse;
      break;
    }

    // 连锁触发
    if (result.triggerNext) {
      for (const next of result.triggerNext) {
        const nextAbility = registry.get(next.abilityID);
        if (!nextAbility) continue;
        const nextCtx = { ...ctx, ...next.ctx };
        const nextResult = nextAbility.apply(currentState, nextCtx, {});
        if (nextResult.state) {
          currentState = nextResult.state;
        }
        allEvents.push(...nextResult.events);
      }
    }
  }

  return { state: currentState, events: allEvents, pendingResponse: pending };
}

/**
 * 判断能力是否与当前上下文相关（避免无关能力被调度）
 */
function isAbilityRelevant(
  ability: AbilityDefinition,
  state: SetupState,
  ctx: AbilityContext,
): boolean {
  // 世界观/梦魇/规则类能力全局生效
  if (ability.kind === 'worldView' || ability.kind === 'nightmare' || ability.kind === 'rule') {
    return true;
  }
  // 技能只对发动者生效
  if (ability.kind === 'skill') {
    const player = state.players[ctx.invokerID];
    if (!player) return false;
    // ID 前缀匹配角色
    return ability.id.startsWith(player.characterId + '.');
  }
  // 行动牌类按需调用，不走自动触发
  return false;
}
