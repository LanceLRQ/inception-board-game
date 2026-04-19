import { describe, it, expect } from 'vitest';
import { isIntentProcessed, markIntentProcessed, incrementMoveCounter } from './index.js';

describe('game-engine', () => {
  describe('moveCounter', () => {
    it('should increment move counter', () => {
      const state = { turn: 0, phase: 'setup', players: {}, moveCounter: 5, schemaVersion: 1 };
      const next = incrementMoveCounter(state);
      expect(next.moveCounter).toBe(6);
    });
  });

  describe('idempotency', () => {
    it('should detect processed intent', () => {
      markIntentProcessed('test-intent-1', 1);
      expect(isIntentProcessed('test-intent-1', 1)).toBe(true);
    });

    it('should return false for new intent', () => {
      expect(isIntentProcessed('new-intent-xyz', 0)).toBe(false);
    });
  });
});
