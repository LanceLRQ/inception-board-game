import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ReputationService,
  InMemoryReputationStore,
  computeReputationLevel,
  computeNextScore,
  INITIAL_REPUTATION_SCORE,
  REPUTATION_MIN,
  REPUTATION_MAX,
} from './ReputationService.js';

describe('computeReputationLevel', () => {
  it('maps scores to correct levels', () => {
    expect(computeReputationLevel(39, 30)).toBe('low');
    expect(computeReputationLevel(40, 30)).toBe('regular');
    expect(computeReputationLevel(69, 20)).toBe('regular');
    expect(computeReputationLevel(70, 19)).toBe('regular');
    expect(computeReputationLevel(70, 20)).toBe('trusted');
  });
});

describe('computeNextScore', () => {
  it('clamps to MIN', () => {
    expect(computeNextScore(5, -100)).toBe(REPUTATION_MIN);
  });

  it('clamps to MAX', () => {
    expect(computeNextScore(REPUTATION_MAX - 1, 50)).toBe(REPUTATION_MAX);
  });

  it('applies delta normally within bounds', () => {
    expect(computeNextScore(50, -10)).toBe(40);
    expect(computeNextScore(50, +2)).toBe(52);
  });
});

describe('ReputationService', () => {
  let store: InMemoryReputationStore;
  let svc: ReputationService;

  beforeEach(() => {
    store = new InMemoryReputationStore();
    svc = new ReputationService(store);
  });

  describe('get', () => {
    it('returns initial score snapshot when no record exists', async () => {
      const r = await svc.get('p1');
      expect(r.score).toBe(50);
      expect(r.level).toBe('regular');
      // 注意：不写入 store（懒建档）
      expect(store.size()).toBe(0);
    });

    it('returns existing record when present', async () => {
      await store.applyDelta('p1', -11, INITIAL_REPUTATION_SCORE);
      const r = await svc.get('p1');
      expect(r.score).toBe(39);
      expect(r.level).toBe('low');
    });
  });

  describe('adjust', () => {
    it('report delta is -10', async () => {
      const r = await svc.adjust('p1', 'report');
      expect(r.score).toBe(40);
      expect(r.level).toBe('regular');
    });

    it('abandon delta is -5 and does not count as a completion', async () => {
      const r = await svc.adjust('p1', 'abandon');
      expect(r).toMatchObject({ score: 45, completedMatches: 0 });
    });

    it('complete delta is +2', async () => {
      const r = await svc.adjust('p1', 'complete');
      expect(r).toMatchObject({ score: 52, completedMatches: 1 });
    });

    it('完成对局但累计三次超时，完局奖励与超时扣分一并结算', async () => {
      const r = await svc.adjust('p1', 'completeWithTimeouts');
      expect(r).toMatchObject({ score: 49, completedMatches: 1 });
    });

    it('accumulates across multiple adjusts', async () => {
      await svc.adjust('p1', 'report');
      await svc.adjust('p1', 'report');
      const r = await svc.adjust('p1', 'abandon');
      expect(r.score).toBe(25);
    });

    it('transitions level at boundary', async () => {
      expect(await svc.adjust('p1', 'report')).toMatchObject({ score: 40, level: 'regular' });
      expect(await svc.adjust('p1', 'abandon')).toMatchObject({ score: 35, level: 'low' });
    });

    it('clamps to floor 0 even with many reports', async () => {
      for (let i = 0; i < 200; i++) {
        await svc.adjust('p1', 'report');
      }
      const r = await store.get('p1');
      expect(r?.score).toBe(0);
      expect(r?.level).toBe('low');
    });

    it('clamps to ceiling 100', async () => {
      // 连续 complete 300 次应触顶
      for (let i = 0; i < 300; i++) {
        await svc.adjust('p1', 'complete');
      }
      const r = await store.get('p1');
      expect(r?.score).toBe(REPUTATION_MAX);
      expect(r?.level).toBe('trusted');
    });

    it('per-player isolation', async () => {
      await svc.adjust('p1', 'report');
      await svc.adjust('p2', 'complete');
      const r1 = await store.get('p1');
      const r2 = await store.get('p2');
      expect(r1?.score).toBe(40);
      expect(r2?.score).toBe(52);
    });
  });

  describe('custom initial score', () => {
    it('respects constructor option', async () => {
      const custom = new ReputationService(store, { initialScore: 35 });
      const r = await custom.get('p1');
      expect(r.score).toBe(35);
      expect(r.level).toBe('low');
    });
  });

  it('每经过完整 30 天恢复 1 分，分数恢复到初始值即停止', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const day = 86_400_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(start);
      await svc.adjust('recovering', 'report');
      await svc.adjust('healthy', 'complete');
      vi.setSystemTime(+start + 29 * day);
      expect((await svc.get('recovering')).score).toBe(40);
      vi.setSystemTime(+start + 60 * day);
      expect((await svc.get('recovering')).score).toBe(42);
      expect((await svc.get('recovering')).score).toBe(42);
      expect((await svc.get('healthy')).score).toBe(52);
      expect((await svc.adjust('recovering', 'complete')).score).toBe(44);
      vi.setSystemTime(+start + 89 * day);
      expect((await svc.get('recovering')).score).toBe(44);
      vi.setSystemTime(+start + 600 * day);
      expect((await svc.get('recovering')).score).toBe(50);
    } finally {
      vi.useRealTimers();
    }
  });
});
