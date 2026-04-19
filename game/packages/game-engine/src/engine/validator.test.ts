// Validator L1-L7 测试
// 对照：plans/design/02-game-rules-spec.md §2.4

import { describe, it, expect } from 'vitest';
import { createInitialState, type SetupState } from '../setup.js';
import {
  validateSchema,
  validateAuth,
  validatePhase,
  validateResource,
  validateTarget,
  validateRule,
  validateRate,
  validateMove,
  type MoveContext,
  type MovePayload,
  type RateGuard,
} from './validator.js';
import type { CardID } from '@icgame/shared';

function makeState(overrides?: Partial<SetupState>): SetupState {
  const s = createInitialState({
    playerCount: 4,
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    nicknames: ['A', 'B', 'C', 'D'],
    rngSeed: 'test',
  });
  const base: SetupState = {
    ...s,
    phase: 'playing',
    turnPhase: 'action',
    currentPlayerID: 'P1',
    dreamMasterID: 'P4',
    players: {
      ...s.players,
      P1: { ...s.players.P1!, hand: ['card-1' as CardID, 'card-2' as CardID] },
      P4: { ...s.players.P4!, faction: 'master' },
    },
  };
  return { ...base, ...overrides };
}

const ctxP1: MoveContext = { playerID: 'P1', currentPlayer: 'P1' };

describe('Validator', () => {
  // === L1 ===
  describe('L1 Schema', () => {
    it('accepts valid payload', () => {
      expect(validateSchema({ name: 'doDraw' }).ok).toBe(true);
    });
    it('rejects non-object', () => {
      const r = validateSchema('foo');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.layer).toBe(1);
    });
    it('rejects missing name', () => {
      const r = validateSchema({});
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('SCHEMA_MISSING_FIELD');
    });
    it('rejects bad types', () => {
      const r = validateSchema({ name: 'doDraw', cardId: 123 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('SCHEMA_BAD_TYPE');
    });
  });

  // === L2 ===
  describe('L2 Auth', () => {
    it('accepts current player', () => {
      const s = makeState();
      expect(validateAuth(s, ctxP1, { name: 'doDraw' }).ok).toBe(true);
    });
    it('rejects non-current player for non-response move', () => {
      const s = makeState();
      const ctx: MoveContext = { playerID: 'P2', currentPlayer: 'P1' };
      const r = validateAuth(s, ctx, { name: 'doDraw' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('AUTH_NOT_CURRENT_PLAYER');
    });
    it('allows non-current player for response moves', () => {
      const s = makeState();
      const ctx: MoveContext = { playerID: 'P2', currentPlayer: 'P1' };
      expect(validateAuth(s, ctx, { name: 'respondCancelUnlock' }).ok).toBe(true);
    });
    it('rejects unknown player', () => {
      const s = makeState();
      const ctx: MoveContext = { playerID: 'PX', currentPlayer: 'PX' };
      const r = validateAuth(s, ctx, { name: 'doDraw' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('AUTH_PLAYER_NOT_FOUND');
    });
  });

  // === L3 ===
  describe('L3 Phase', () => {
    it('rejects move in wrong turnPhase', () => {
      const s = makeState({ turnPhase: 'draw' });
      const r = validatePhase(s, { name: 'playShoot' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('STAGE_INVALID');
    });
    it('allows doDraw in draw phase', () => {
      const s = makeState({ turnPhase: 'draw' });
      expect(validatePhase(s, { name: 'doDraw' }).ok).toBe(true);
    });
    it('blocks non-response moves when pendingUnlock active', () => {
      const s = makeState({
        pendingUnlock: { playerID: 'P1', layer: 1, cardId: 'c' as CardID },
      });
      const r = validatePhase(s, { name: 'playShoot' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('PENDING_RESPONSE_BLOCKED');
    });
    it('rejects when game not in playing phase', () => {
      const s = makeState({ phase: 'setup' });
      const r = validatePhase(s, { name: 'doDraw' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('PHASE_INVALID');
    });
  });

  // === L4 ===
  describe('L4 Resource', () => {
    it('rejects dead player', () => {
      const s = makeState();
      s.players.P1 = { ...s.players.P1!, isAlive: false };
      const r = validateResource(s, ctxP1, { name: 'doDraw' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('RESOURCE_PLAYER_DEAD');
    });
    it('rejects card not in hand', () => {
      const s = makeState();
      const r = validateResource(s, ctxP1, { name: 'playShoot', cardId: 'xxx' as CardID });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('RESOURCE_NO_CARD');
    });
    it('allows card in hand', () => {
      const s = makeState();
      expect(validateResource(s, ctxP1, { name: 'playShoot', cardId: 'card-1' as CardID }).ok).toBe(
        true,
      );
    });
    it('rejects master playing unlock', () => {
      const s = makeState({ currentPlayerID: 'P4' });
      const ctx: MoveContext = { playerID: 'P4', currentPlayer: 'P4' };
      s.players.P4 = { ...s.players.P4!, hand: ['u' as CardID] };
      const r = validateResource(s, ctx, { name: 'playUnlock', cardId: 'u' as CardID });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('RESOURCE_FACTION_MISMATCH');
    });
  });

  // === L5 ===
  describe('L5 Target', () => {
    it('rejects unknown target', () => {
      const s = makeState();
      const r = validateTarget(s, { name: 'playShoot', targetPlayerID: 'PX' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('TARGET_NOT_FOUND');
    });
    it('rejects dead target', () => {
      const s = makeState();
      s.players.P2 = { ...s.players.P2!, isAlive: false };
      const r = validateTarget(s, { name: 'playShoot', targetPlayerID: 'P2' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('TARGET_DEAD');
    });
    it('rejects bad layer', () => {
      const s = makeState();
      const r = validateTarget(s, { name: 'playDreamTransit', targetLayer: 99 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('TARGET_LAYER_INVALID');
    });
  });

  // === L6 ===
  describe('L6 Rule', () => {
    it('rejects second unlock in turn', () => {
      const s = makeState();
      s.players.P1 = {
        ...s.players.P1!,
        successfulUnlocksThisTurn: 1,
        hand: ['u' as CardID],
      };
      const r = validateRule(s, ctxP1, { name: 'playUnlock', cardId: 'u' as CardID });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('RULE_UNLOCK_LIMIT');
    });
    it('rejects unlock when no heart lock', () => {
      const s = makeState();
      s.layers[1] = { ...s.layers[1]!, heartLockValue: 0 };
      const r = validateRule(s, ctxP1, { name: 'playUnlock', cardId: 'u' as CardID });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('RULE_NO_HEART_LOCK');
    });
    it('rejects non-adjacent layer transit', () => {
      const s = makeState();
      const r = validateRule(s, ctxP1, { name: 'playDreamTransit', targetLayer: 3 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('RULE_LAYER_NOT_ADJACENT');
    });
  });

  // === L7 ===
  describe('L7 Rate', () => {
    it('passes when no guard', () => {
      expect(validateRate(ctxP1).ok).toBe(true);
    });
    it('rejects duplicate intent', () => {
      const guard: RateGuard = {
        isDuplicate: () => true,
        isRateLimited: () => false,
      };
      const ctx: MoveContext = { ...ctxP1, intentId: 'int-1' };
      const r = validateRate(ctx, guard);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('RATE_INTENT_DUPLICATE');
    });
    it('rejects rate limit', () => {
      const guard: RateGuard = {
        isDuplicate: () => false,
        isRateLimited: () => true,
      };
      const r = validateRate(ctxP1, guard);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  // === 完整流水线 ===
  describe('validateMove pipeline', () => {
    it('end-to-end happy path', () => {
      const s = makeState();
      const r = validateMove(s, ctxP1, { name: 'doDraw' } as MovePayload);
      // doDraw 不允许在 action 阶段，应该 L3 失败
      expect(r.ok).toBe(false);
    });
    it('happy path for playShoot', () => {
      const s = makeState();
      const r = validateMove(s, ctxP1, {
        name: 'playShoot',
        cardId: 'card-1' as CardID,
        targetPlayerID: 'P2',
      } as MovePayload);
      expect(r.ok).toBe(true);
    });
    it('short-circuits at L1 on bad schema', () => {
      const s = makeState();
      const r = validateMove(s, ctxP1, null);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.layer).toBe(1);
    });
  });
});
