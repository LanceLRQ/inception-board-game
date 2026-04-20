// 能力系统入口
// 对照：plans/design/05-card-system.md §5.1-§5.3

export type {
  PriorityBucket,
  TriggerTiming,
  AbilityKind,
  SkillScope,
  InputKind,
  InputSpec,
  DiceModifierKind,
  DiceModifierEntry,
  EffectStackFrame,
  ValidationResult,
  AbilityContext,
  PendingShootContext,
  PendingResponse,
  ApplyResult,
  TriggerNextEntry,
  GameEvent,
  AbilityDefinition,
  ResolvedInputs,
  AbilityRegistry,
} from './types.js';

export { arbitrate, resolveDiceModifiers } from './priority.js';
export { InMemoryAbilityRegistry } from './registry.js';
export { getUsageCount, canUse, incrementUsage, resetTurnUsage } from './usage-counter.js';
export type { UsageKey } from './usage-counter.js';
export { dispatchTrigger } from './trigger-dispatcher.js';
export type { TriggerDispatchResult } from './trigger-dispatcher.js';
export {
  openResponseWindow,
  passOnResponse,
  respondToWindow,
  isWindowComplete,
  handleTimeout,
} from './response-chain.js';
export type { ResponseWindowState } from './response-chain.js';
export {
  isDualFaced,
  getFlippedId,
  flipCharacter,
  flipCharacters,
  getDualFacedConfig,
  DUAL_FACED_CHARS,
} from './dual-faced.js';
export type { DualFacedConfig } from './dual-faced.js';
export {
  restoreShiftSnapshot,
  validateShiftSnapshot,
  shiftGuardAndRestore,
} from './shift-guard.js';
