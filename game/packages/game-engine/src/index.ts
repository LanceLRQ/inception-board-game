// @icgame/game-engine - 游戏引擎

// 幂等性检查
const processedIntents = new Map<string, number>();

export interface MoveIntent {
  readonly type: string;
  readonly payload: unknown;
  readonly intentId: string;
}

export interface MoveResult {
  readonly ok: boolean;
  readonly state: unknown;
  readonly error?: string;
}

export function isIntentProcessed(intentId: string, _currentCounter: number): boolean {
  return processedIntents.has(intentId);
}

export function markIntentProcessed(intentId: string, counter: number): void {
  if (processedIntents.size > 1000) {
    const oldest = processedIntents.keys().next().value;
    if (oldest !== undefined) processedIntents.delete(oldest);
  }
  processedIntents.set(intentId, counter);
}

export function incrementMoveCounter(state: { moveCounter: number }): typeof state {
  return { ...state, moveCounter: state.moveCounter + 1 };
}

// 导出游戏核心
export { InceptionCityGame } from './game.js';
export type { SetupState } from './game.js';
export { createInitialState } from './setup.js';
export {
  drawCards,
  discardCard,
  discardToLimit,
  getDiscardCount,
  beginTurn,
  endTurn,
  setTurnPhase,
  movePlayerToLayer,
  isAdjacentLayer,
  recordCardPlayed,
} from './moves.js';
export { rollDice, resolveShoot } from './dice.js';
export type { DiceResult, DiceModifier, ShootOutcome } from './dice.js';
export * from './config.js';
export { migrateGameState, getSchemaVersion } from './migrations.js';

// 服务端权威 · 零信任过滤（Phase 2 B5）
export {
  validateMove,
  validateSchema,
  validateAuth,
  validatePhase,
  validateResource,
  validateTarget,
  validateRule,
  validateRate,
} from './engine/validator.js';
export type {
  ValidationCode,
  ValidationOk,
  ValidationFail,
  ValidationResult,
  MoveName,
  MoveContext,
  MovePayload,
  RateGuard,
} from './engine/validator.js';

export { filterFor, filterEventLog, assertNoLeakage } from './engine/playerView.js';
export type {
  FilteredPlayer,
  FilteredVault,
  FilteredBribe,
  FilteredDeck,
  FilteredState,
  FilterOptions,
  EventLogEntry,
} from './engine/playerView.js';

export { resolveRecipients, rewriteForViewer, distribute, Events } from './engine/broadcaster.js';
export type { EventVisibility, BroadcastEvent, BroadcastContext } from './engine/broadcaster.js';

// 健壮性 · 死亡/迷失层/超时（Phase 2 B7）
export {
  LOST_LAYER,
  canAct,
  applyDeath,
  allThievesDead,
  getAlivePlayers,
  getAliveInLayer,
} from './engine/death.js';
export type { DeathCause, DeathEvent } from './engine/death.js';

export {
  RESPONSE_WINDOW_MS,
  AI_TAKEOVER_MS,
  DISCONNECT_FORCE_MS,
  applyResponseTimeout,
  shouldTakeover,
  shouldForceDisconnect,
} from './engine/timeout.js';
export type { TimeoutDefault, PresenceInfo } from './engine/timeout.js';

// 规则不变量（B12）
export { checkInvariants, assertInvariants } from './invariants.js';
export type { InvariantViolation } from './invariants.js';

// 角色技能执行器（MVP 2+2）
export {
  canUseSkill,
  markSkillUsed,
  applyPointmanAssault,
  pointmanCheckDrawnCards,
  applyInterpreterForeshadow,
  applyFortressColdness,
  applyFortressDiceModifier,
  applyChessTranspose,
  applyChessWorldViewPeek,
  getChessUsesLeft,
  applyTouristAssist,
  canUseTouristAssist,
  applyLeoKingdom,
  isCapricornusRhythmActive,
  applyChemistRefine,
  applyLordOfWarBlackMarket,
  applyPaprikSalvation,
  applySudgerVerdict,
  applyScorpiusPoison,
  applyTaurusHorn,
  libraValidateSplit,
  libraResolvePick,
  POINTMAN_SKILL_ID,
  INTERPRETER_SKILL_ID,
  FORTRESS_SKILL_ID,
  CHESS_SKILL_ID,
  TOURIST_SKILL_ID,
  LEO_SKILL_ID,
  CAPRICORNUS_SKILL_ID,
  CHEMIST_SKILL_ID,
  LORD_OF_WAR_SKILL_ID,
  PAPRIK_SKILL_ID,
  SUDGER_SKILL_ID,
  SCORPIUS_SKILL_ID,
  TAURUS_SKILL_ID,
  LIBRA_SKILL_ID,
  applyApolloWorship,
  applyMartyrSacrifice,
  applySoulSculptorCarve,
  applyHaleyImpact,
  applyAthenaAwe,
  applyAthenaWit,
  checkAthenaAweCondition,
  isVirgoPerfectTriggered,
  isShootClassCard,
  APOLLO_WORSHIP_SKILL_ID,
  MARTYR_SKILL_ID,
  SOUL_SCULPTOR_SKILL_ID,
  HALEY_SKILL_ID,
  ATHENA_AWE_SKILL_ID,
  ATHENA_WIT_SKILL_ID,
  VIRGO_SKILL_ID,
  ARCHITECT_SKILL_ID,
  applyShadeFollow,
  applyHlninoFlow,
  applyExtractorBounty,
  applyForgerExchange,
  isTerroristCrossLayerActive,
  jokerDrawCount,
  applyBlackHoleLevy,
  applyBlackSwanTour,
  applySpaceQueenObserve,
  applySpaceQueenStashTop,
  SHADE_SKILL_ID,
  HLNINO_SKILL_ID,
  EXTRACTOR_SKILL_ID,
  FORGER_SKILL_ID,
  TERRORIST_SKILL_ID,
  JOKER_SKILL_ID,
  BLACK_HOLE_LEVY_SKILL_ID,
  BLACK_SWAN_SKILL_ID,
  SPACE_QUEEN_OBSERVE_SKILL_ID,
  SPACE_QUEEN_TOP_SKILL_ID,
  findCoinVaultsWithHiddenNightmare,
  findMasterID,
  applyDiscardHiddenNightmare,
} from './engine/skills.js';

// 测试 fixtures（B12）
export {
  createTestState,
  makePlayer,
  makeLayer,
  makeDefaultLayers,
  makeDefaultVaults,
  cloneState,
  withBribes,
  withHand,
} from './testing/fixtures.js';
export {
  scenarioStartOfGame3p,
  scenarioMidGameThiefAtL3,
  scenarioThiefNearWin,
  scenarioMasterWin,
  scenarioEmptyState,
} from './testing/scenarios.js';
