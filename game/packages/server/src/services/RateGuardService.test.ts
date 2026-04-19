// RateGuardService 测试 - 内存版 + 行为校验
// Redis 版需集成测试，本地只跑内存版

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRateGuard } from './RateGuardService.js';

describe('InMemoryRateGuard', () => {
  let guard: InMemoryRateGuard;

  beforeEach(() => {
    guard = new InMemoryRateGuard({
      intentTtlMs: 1000,
      windowMs: 1000,
      maxPerWindow: 3,
    });
  });

  describe('intent dedup', () => {
    it('returns false for unknown intent', () => {
      expect(guard.isDuplicate('intent-1')).toBe(false);
    });
    it('returns true after recordIntent', () => {
      guard.recordIntent('intent-1');
      expect(guard.isDuplicate('intent-1')).toBe(true);
    });
    it('keeps different intents isolated', () => {
      guard.recordIntent('intent-a');
      expect(guard.isDuplicate('intent-b')).toBe(false);
    });
  });

  describe('rate limit', () => {
    it('allows up to maxPerWindow moves', () => {
      guard.recordMove('P1');
      guard.recordMove('P1');
      expect(guard.isRateLimited('P1')).toBe(false);
      guard.recordMove('P1');
      expect(guard.isRateLimited('P1')).toBe(true);
    });
    it('isolates different players', () => {
      guard.recordMove('P1');
      guard.recordMove('P1');
      guard.recordMove('P1');
      expect(guard.isRateLimited('P1')).toBe(true);
      expect(guard.isRateLimited('P2')).toBe(false);
    });
    it('default instance allows burst under default budget', () => {
      const g = new InMemoryRateGuard();
      for (let i = 0; i < 25; i++) g.recordMove('P');
      expect(g.isRateLimited('P')).toBe(false);
      for (let i = 0; i < 10; i++) g.recordMove('P');
      expect(g.isRateLimited('P')).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears intent + moves', () => {
      guard.recordIntent('i');
      guard.recordMove('P');
      guard.reset();
      expect(guard.isDuplicate('i')).toBe(false);
      expect(guard.isRateLimited('P')).toBe(false);
    });
  });
});
