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
export { INVALID_MOVE } from './engine/invalidMove.js';
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
export { migrateGameState, getSchemaVersion, CURRENT_SCHEMA_VERSION } from './migrations.js';

// 请求校验：move 名单由 move 表派生 · 请求形状 · 幂等与限流
export {
  knownMoves,
  isKnownMove,
  validateRequestShape,
  validateRate,
  MAX_ARGS,
  MAX_REQUEST_BYTES,
} from './engine/validator.js';
export type {
  ValidatedRequest,
  RequestShapeCode,
  RequestShapeResult,
  RateCode,
  RateResult,
  RateContext,
  RateGuard,
} from './engine/validator.js';

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
  applyMercuryRouteExtraFailBribe,
  applyMercuryReverse,
  MERCURY_REVERSE_SKILL_ID,
  applySpaceQueenObserve,
  applySpaceQueenStashTop,
  SHADE_SKILL_ID,
  HLNINO_SKILL_ID,
  EXTRACTOR_SKILL_ID,
  FORGER_SKILL_ID,
  TERRORIST_SKILL_ID,
  JOKER_SKILL_ID,
  BLACK_HOLE_LEVY_SKILL_ID,
  BLACK_HOLE_ABSORB_SKILL_ID,
  applyBlackHoleAbsorb,
  applyImperialCityWorldShoot,
  applyRevive,
  isSecretPassageWorldActive,
  applyVenusMirrorWorld,
  VENUS_MIRROR_WORLD_SKILL_ID,
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

// 对局运行器
export {
  createMatch,
  applyMove,
  matchFromSnapshot,
  assertSupportedGame,
  viewMatch,
  eventsFor,
  replayMatch,
} from './runner/matchRunner.js';
export type {
  GameDef,
  PhaseDef,
  TurnDef,
  MoveDef,
  MoveArgs,
  HookArgs,
  MatchState,
  RunnerCtx,
  RandomSource,
  MoveRequest,
  MoveOutcome,
  RejectReason,
  ApplyMoveOptions,
  CreateMatchOptions,
  MatchViewState,
  MatchEvent,
  MatchRecord,
} from './runner/matchRunner.js';

// 行动权：此刻在等谁、等什么（服务端据此决定计时与提示）
export { listAwaiting } from './engine/actionRights.js';
export type { Awaiting } from './engine/actionRights.js';

// 白名单式对局视图：服务端发给每个观察者的状态
export { viewFor, FIELD_DISPOSITION } from './engine/matchView.js';
export { matchOutcome } from './engine/outcome.js';
export type { MatchOutcome } from './engine/outcome.js';

// 对局事件：对比一步前后的状态推导领域事件
export { describeMatchEvents } from './engine/matchEvents.js';
export type {
  MatchView,
  MatchViewOptions,
  Viewer,
  PlayerView,
  LayerView,
  VaultView,
  BribeView,
  DeckView,
  ResponseWindowView,
} from './engine/matchView.js';

// 联机对局消息协议
export { MATCH_PROTOCOL_VERSION, parseClientMatchMessage } from './net/matchProtocol.js';
export type {
  ClientMatchMessage,
  ServerMatchMessage,
  SeatInfo,
  SeatTakeoverReason,
  MatchSnapshotForViewer,
  MoveRejectCode,
} from './net/matchProtocol.js';
