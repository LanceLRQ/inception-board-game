// 响应窗口超时 + AI 接管阈值测试

import { describe, it, expect } from 'vitest';
import { createInitialState, type SetupState } from '../setup.js';
import {
  RESPONSE_WINDOW_MS,
  AI_TAKEOVER_MS,
  DISCONNECT_FORCE_MS,
  applyResponseTimeout,
  shouldTakeover,
  shouldForceDisconnect,
} from './timeout.js';
import type { CardID } from '@icgame/shared';

function makeState(): SetupState {
  const s = createInitialState({
    playerCount: 4,
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    nicknames: ['A', 'B', 'C', 'D'],
    rngSeed: 'seed',
  });
  return {
    ...s,
    phase: 'playing',
    turnPhase: 'action',
    currentPlayerID: 'P1',
    pendingUnlock: { playerID: 'P1', layer: 1, cardId: 'action_unlock' as CardID },
  };
}

describe('Timeout', () => {
  describe('constants', () => {
    it('timeouts are reasonable', () => {
      expect(RESPONSE_WINDOW_MS).toBe(30_000);
      expect(AI_TAKEOVER_MS).toBe(60_000);
      expect(DISCONNECT_FORCE_MS).toBe(180_000);
    });
  });

  describe('applyResponseTimeout', () => {
    it('default pass → unlock succeeds', () => {
      const s = makeState();
      const next = applyResponseTimeout(s);
      expect(next.pendingUnlock).toBeNull();
      // 心锁应减 1（pass 语义 = applyUnlockSuccess）
      expect(next.layers[1]!.heartLockValue).toBe(s.layers[1]!.heartLockValue - 1);
    });
    it('cancel mode → unlock cancelled', () => {
      const s = makeState();
      const next = applyResponseTimeout(s, 'cancel');
      expect(next.pendingUnlock).toBeNull();
      // 心锁不变
      expect(next.layers[1]!.heartLockValue).toBe(s.layers[1]!.heartLockValue);
    });
    it('no-op without pendingUnlock', () => {
      const s = { ...makeState(), pendingUnlock: null };
      const next = applyResponseTimeout(s);
      expect(next).toBe(s);
    });
  });

  describe('presence helpers', () => {
    const now = 1_000_000;
    it('shouldTakeover true after AI_TAKEOVER_MS silence', () => {
      expect(
        shouldTakeover(
          { playerID: 'P1', lastActivityAt: now - 61_000, isAiControlled: false },
          now,
        ),
      ).toBe(true);
    });
    it('shouldTakeover false within threshold', () => {
      expect(
        shouldTakeover(
          { playerID: 'P1', lastActivityAt: now - 30_000, isAiControlled: false },
          now,
        ),
      ).toBe(false);
    });
    it('shouldTakeover false if already AI', () => {
      expect(
        shouldTakeover(
          { playerID: 'P1', lastActivityAt: now - 120_000, isAiControlled: true },
          now,
        ),
      ).toBe(false);
    });
    it('shouldForceDisconnect triggers after 3 min', () => {
      expect(
        shouldForceDisconnect(
          { playerID: 'P1', lastActivityAt: now - 181_000, isAiControlled: false },
          now,
        ),
      ).toBe(true);
      expect(
        shouldForceDisconnect(
          { playerID: 'P1', lastActivityAt: now - 100_000, isAiControlled: false },
          now,
        ),
      ).toBe(false);
    });
  });
});
