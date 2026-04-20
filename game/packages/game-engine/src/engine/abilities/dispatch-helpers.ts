// Dispatcher 工具层 — 简化 game.ts 与 abilities registry 的对接
// 对照：plans/design/05-card-system.md §5.1
//
// 设计原则：
//   - 单例 registry（lazy-init）避免每次对局创建时重建
//   - 只自动运行 passive kind 的 AbilityDefinition，避免中断主 move 流程
//   - 主动技能通过 `listAvailableActives` 暴露给 UI，由玩家显式触发

import type { SetupState } from '../../setup.js';
import { createDefaultRegistry } from './characters/index.js';
import type { InMemoryAbilityRegistry } from './registry.js';
import type { AbilityContext, AbilityDefinition, TriggerTiming } from './types.js';

let defaultRegistry: InMemoryAbilityRegistry | null = null;

/** 获取默认 registry 单例（含全部已注册角色能力） */
export function getDefaultRegistry(): InMemoryAbilityRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createDefaultRegistry();
  }
  return defaultRegistry;
}

/** 测试用：重置单例 */
export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}

/** 从 SetupState 快速构造 AbilityContext */
export function buildAbilityContext(
  state: SetupState,
  invokerID: string,
  extras: Partial<AbilityContext> = {},
): AbilityContext {
  const player = state.players[invokerID];
  return {
    invokerID,
    turnNumber: state.turnNumber,
    turnPhase: state.turnPhase,
    dreamMasterID: state.dreamMasterID,
    invokerFaction: player?.faction ?? 'thief',
    d6: extras.d6 ?? (() => 4),
    ...extras,
  };
}

/**
 * 列出指定触发时机下，对 invokerID 可激活的主动技能（供 UI 展示按钮）
 * 不修改 state；仅读取
 */
export function listAvailableActives(
  state: SetupState,
  timing: TriggerTiming,
  invokerID: string,
  registry: InMemoryAbilityRegistry = getDefaultRegistry(),
): AbilityDefinition[] {
  const ctx = buildAbilityContext(state, invokerID);
  const player = state.players[invokerID];
  if (!player) return [];
  const charId = player.characterId;
  const out: AbilityDefinition[] = [];
  for (const a of registry.getByTrigger(timing)) {
    // 仅保留对该角色自身的能力（ID 前缀匹配）
    if (!a.id.startsWith(charId + '.')) continue;
    // passive 已在 dispatchPassives 里处理，不再列入"可用主动"
    if (a.scope === 'passive') continue;
    if (!a.canActivate(state, ctx).ok) continue;
    out.push(a);
  }
  return out;
}

/**
 * 自动运行所有 passive 能力的 apply（遍历所有活着的玩家）
 * 返回新 state + 累计事件；遇到 pendingResponse 提前返回
 */
export function dispatchPassives(
  state: SetupState,
  timing: TriggerTiming,
  registry: InMemoryAbilityRegistry = getDefaultRegistry(),
): { state: SetupState; events: Array<{ type: string; playerID: string }> } {
  let currentState = state;
  const events: Array<{ type: string; playerID: string }> = [];
  const candidates = registry.getByTrigger(timing).filter((a) => a.scope === 'passive');
  if (candidates.length === 0) return { state: currentState, events };

  for (const playerID of state.playerOrder) {
    const player = state.players[playerID];
    if (!player || !player.isAlive) continue;
    const ctx = buildAbilityContext(currentState, playerID);
    for (const ability of candidates) {
      if (!ability.id.startsWith(player.characterId + '.')) continue;
      const validation = ability.canActivate(currentState, ctx);
      if (!validation.ok) continue;
      const result = ability.apply(currentState, ctx, {});
      if (result.state) currentState = result.state;
      for (const e of result.events) {
        events.push({ type: e.type, playerID: e.playerID });
      }
      if (result.pendingResponse) {
        return { state: currentState, events };
      }
    }
  }
  return { state: currentState, events };
}
