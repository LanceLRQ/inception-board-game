// Move Validator - L1-L7 七层校验流水线
// 对照：plans/design/02-game-rules-spec.md §2.4 + plans/design/08-security-ai.md §8.4

import type { SetupState } from '../setup.js';
import type { CardID } from '@icgame/shared';

// === 错误码 ===

export type ValidationCode =
  // L1 Schema
  | 'SCHEMA_INVALID'
  | 'SCHEMA_MISSING_FIELD'
  | 'SCHEMA_BAD_TYPE'
  // L2 身份
  | 'AUTH_PLAYER_MISMATCH'
  | 'AUTH_PLAYER_NOT_FOUND'
  | 'AUTH_NOT_CURRENT_PLAYER'
  // L3 阶段
  | 'PHASE_INVALID'
  | 'STAGE_INVALID'
  | 'PENDING_RESPONSE_BLOCKED'
  // L4 资源
  | 'RESOURCE_NO_CARD'
  | 'RESOURCE_PLAYER_DEAD'
  | 'RESOURCE_FACTION_MISMATCH'
  // L5 目标
  | 'TARGET_NOT_FOUND'
  | 'TARGET_DEAD'
  | 'TARGET_LAYER_INVALID'
  | 'TARGET_SELF_FORBIDDEN'
  // L6 规则
  | 'RULE_UNLOCK_LIMIT'
  | 'RULE_HAND_LIMIT'
  | 'RULE_LAYER_NOT_ADJACENT'
  | 'RULE_NO_HEART_LOCK'
  // L7 频率
  | 'RATE_INTENT_DUPLICATE'
  | 'RATE_LIMIT_EXCEEDED';

export interface ValidationOk {
  readonly ok: true;
}

export interface ValidationFail {
  readonly ok: false;
  readonly layer: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly code: ValidationCode;
  readonly reason: string;
}

export type ValidationResult = ValidationOk | ValidationFail;

const OK: ValidationOk = { ok: true };

function fail(
  layer: ValidationFail['layer'],
  code: ValidationCode,
  reason: string,
): ValidationFail {
  return { ok: false, layer, code, reason };
}

// === Move 类型描述 ===

export type MoveName =
  | 'doDraw'
  | 'skipDraw'
  | 'doDiscard'
  | 'skipDiscard'
  | 'endActionPhase'
  | 'playShoot'
  | 'playUnlock'
  | 'resolveUnlock'
  | 'respondCancelUnlock'
  | 'passResponse'
  | 'playDreamTransit'
  | 'playCreation'
  | 'dreamMasterMove';

export interface MoveContext {
  readonly playerID: string; // WS 鉴权后的 playerID
  readonly currentPlayer: string; // BGIO ctx.currentPlayer
  readonly intentId?: string;
  readonly turnStage?: string; // BGIO stage（可选）
}

export interface MovePayload {
  readonly name: MoveName;
  readonly cardId?: CardID;
  readonly targetPlayerID?: string;
  readonly targetLayer?: number;
  readonly cardIds?: CardID[];
}

// === L1 · Schema 校验 ===

export function validateSchema(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return fail(1, 'SCHEMA_INVALID', 'payload must be an object');
  }
  const p = payload as Partial<MovePayload>;
  if (typeof p.name !== 'string') {
    return fail(1, 'SCHEMA_MISSING_FIELD', 'missing move name');
  }
  if (p.cardId !== undefined && typeof p.cardId !== 'string') {
    return fail(1, 'SCHEMA_BAD_TYPE', 'cardId must be string');
  }
  if (p.targetPlayerID !== undefined && typeof p.targetPlayerID !== 'string') {
    return fail(1, 'SCHEMA_BAD_TYPE', 'targetPlayerID must be string');
  }
  if (p.targetLayer !== undefined && typeof p.targetLayer !== 'number') {
    return fail(1, 'SCHEMA_BAD_TYPE', 'targetLayer must be number');
  }
  if (p.cardIds !== undefined && !Array.isArray(p.cardIds)) {
    return fail(1, 'SCHEMA_BAD_TYPE', 'cardIds must be array');
  }
  return OK;
}

// === L2 · 身份鉴权 ===

export function validateAuth(
  state: SetupState,
  ctx: MoveContext,
  payload: MovePayload,
): ValidationResult {
  if (!state.players[ctx.playerID]) {
    return fail(2, 'AUTH_PLAYER_NOT_FOUND', `player ${ctx.playerID} not in match`);
  }
  if (ctx.playerID !== ctx.currentPlayer) {
    // 响应窗口类 move 允许非当前玩家
    if (
      payload.name !== 'respondCancelUnlock' &&
      payload.name !== 'passResponse' &&
      payload.name !== 'resolveUnlock'
    ) {
      return fail(
        2,
        'AUTH_NOT_CURRENT_PLAYER',
        `${ctx.playerID} is not current player (${ctx.currentPlayer})`,
      );
    }
  }
  return OK;
}

// === L3 · 阶段合法性 ===

const PHASE_ALLOWED_MOVES: Record<SetupState['turnPhase'], MoveName[]> = {
  turnStart: [],
  draw: ['doDraw', 'skipDraw'],
  action: [
    'endActionPhase',
    'playShoot',
    'playUnlock',
    'resolveUnlock',
    'respondCancelUnlock',
    'passResponse',
    'playDreamTransit',
    'playCreation',
    'dreamMasterMove',
  ],
  discard: ['doDiscard', 'skipDiscard'],
  turnEnd: [],
};

export function validatePhase(state: SetupState, payload: MovePayload): ValidationResult {
  if (state.phase !== 'playing') {
    return fail(3, 'PHASE_INVALID', `game phase is ${state.phase}, not playing`);
  }
  const allowed = PHASE_ALLOWED_MOVES[state.turnPhase] ?? [];
  if (!allowed.includes(payload.name)) {
    return fail(
      3,
      'STAGE_INVALID',
      `move ${payload.name} not allowed in turnPhase ${state.turnPhase}`,
    );
  }
  // 响应窗口：有 pendingUnlock 时只允许响应类 move
  if (state.pendingUnlock) {
    const responseOnly: MoveName[] = ['respondCancelUnlock', 'passResponse', 'resolveUnlock'];
    if (!responseOnly.includes(payload.name)) {
      return fail(
        3,
        'PENDING_RESPONSE_BLOCKED',
        `pendingUnlock active, only response moves allowed`,
      );
    }
  }
  return OK;
}

// === L4 · 资源/手牌 ===

export function validateResource(
  state: SetupState,
  ctx: MoveContext,
  payload: MovePayload,
): ValidationResult {
  const player = state.players[ctx.playerID];
  if (!player) return fail(4, 'RESOURCE_PLAYER_DEAD', 'player not found');
  if (!player.isAlive && payload.name !== 'passResponse') {
    return fail(4, 'RESOURCE_PLAYER_DEAD', `player ${ctx.playerID} is dead`);
  }
  if (payload.cardId !== undefined) {
    if (!player.hand.includes(payload.cardId)) {
      return fail(4, 'RESOURCE_NO_CARD', `card ${payload.cardId} not in hand`);
    }
  }
  if (payload.name === 'playUnlock' && player.faction !== 'thief') {
    return fail(4, 'RESOURCE_FACTION_MISMATCH', 'only thieves can play unlock');
  }
  if (payload.name === 'dreamMasterMove' && player.faction !== 'master') {
    return fail(4, 'RESOURCE_FACTION_MISMATCH', 'only dream master can dreamMasterMove');
  }
  return OK;
}

// === L5 · 目标合法性 ===

export function validateTarget(state: SetupState, payload: MovePayload): ValidationResult {
  if (payload.targetPlayerID !== undefined) {
    const t = state.players[payload.targetPlayerID];
    if (!t) return fail(5, 'TARGET_NOT_FOUND', `target ${payload.targetPlayerID} not found`);
    if (!t.isAlive) return fail(5, 'TARGET_DEAD', `target ${payload.targetPlayerID} is dead`);
  }
  if (payload.targetLayer !== undefined) {
    if (payload.targetLayer < 0 || payload.targetLayer > 4) {
      return fail(5, 'TARGET_LAYER_INVALID', `targetLayer ${payload.targetLayer} out of range`);
    }
  }
  return OK;
}

// === L6 · 规则不变量 ===

export function validateRule(
  state: SetupState,
  ctx: MoveContext,
  payload: MovePayload,
): ValidationResult {
  const player = state.players[ctx.playerID];
  if (!player) return OK;

  if (payload.name === 'playUnlock') {
    if (player.successfulUnlocksThisTurn >= state.maxUnlockPerTurn) {
      return fail(
        6,
        'RULE_UNLOCK_LIMIT',
        `unlock limit reached (${player.successfulUnlocksThisTurn}/${state.maxUnlockPerTurn})`,
      );
    }
    const layerState = state.layers[player.currentLayer];
    if (!layerState || layerState.heartLockValue <= 0) {
      return fail(6, 'RULE_NO_HEART_LOCK', `layer ${player.currentLayer} has no heart lock`);
    }
  }

  if (payload.name === 'playDreamTransit' && payload.targetLayer !== undefined) {
    if (Math.abs(player.currentLayer - payload.targetLayer) !== 1) {
      return fail(
        6,
        'RULE_LAYER_NOT_ADJACENT',
        `layer ${payload.targetLayer} not adjacent to ${player.currentLayer}`,
      );
    }
  }

  if (payload.name === 'dreamMasterMove' && payload.targetLayer !== undefined) {
    if (Math.abs(player.currentLayer - payload.targetLayer) !== 1) {
      return fail(
        6,
        'RULE_LAYER_NOT_ADJACENT',
        `layer ${payload.targetLayer} not adjacent to ${player.currentLayer}`,
      );
    }
  }

  return OK;
}

// === L7 · 频率/幂等 ===

// 在 server 层配合 Redis 实现；engine 层仅提供接口
export interface RateGuard {
  isDuplicate(intentId: string): boolean;
  isRateLimited(playerID: string): boolean;
}

export function validateRate(ctx: MoveContext, guard?: RateGuard): ValidationResult {
  if (!guard) return OK;
  if (ctx.intentId && guard.isDuplicate(ctx.intentId)) {
    return fail(7, 'RATE_INTENT_DUPLICATE', `intent ${ctx.intentId} already processed`);
  }
  if (guard.isRateLimited(ctx.playerID)) {
    return fail(7, 'RATE_LIMIT_EXCEEDED', `rate limit exceeded for ${ctx.playerID}`);
  }
  return OK;
}

// === 完整流水线 ===

export function validateMove(
  state: SetupState,
  ctx: MoveContext,
  payloadRaw: unknown,
  guard?: RateGuard,
): ValidationResult {
  // L1
  const l1 = validateSchema(payloadRaw);
  if (!l1.ok) return l1;
  const payload = payloadRaw as MovePayload;

  // L2
  const l2 = validateAuth(state, ctx, payload);
  if (!l2.ok) return l2;

  // L3
  const l3 = validatePhase(state, payload);
  if (!l3.ok) return l3;

  // L4
  const l4 = validateResource(state, ctx, payload);
  if (!l4.ok) return l4;

  // L5
  const l5 = validateTarget(state, payload);
  if (!l5.ok) return l5;

  // L6
  const l6 = validateRule(state, ctx, payload);
  if (!l6.ok) return l6;

  // L7
  const l7 = validateRate(ctx, guard);
  if (!l7.ok) return l7;

  return OK;
}
