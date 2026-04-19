import { describe, it, expect, beforeEach } from 'vitest';
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
    expect(computeReputationLevel(0)).toBe('restricted');
    expect(computeReputationLevel(599)).toBe('restricted');
    expect(computeReputationLevel(600)).toBe('watched');
    expect(computeReputationLevel(799)).toBe('watched');
    expect(computeReputationLevel(800)).toBe('normal');
    expect(computeReputationLevel(1099)).toBe('normal');
    expect(computeReputationLevel(1100)).toBe('trusted');
    expect(computeReputationLevel(1500)).toBe('trusted');
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
    expect(computeNextScore(1000, -10)).toBe(990);
    expect(computeNextScore(1000, +2)).toBe(1002);
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
      expect(r.score).toBe(INITIAL_REPUTATION_SCORE);
      expect(r.level).toBe('normal');
      // 注意：不写入 store（懒建档）
      expect(store.size()).toBe(0);
    });

    it('returns existing record when present', async () => {
      await store.upsert('p1', { score: 600, level: 'watched' });
      const r = await svc.get('p1');
      expect(r.score).toBe(600);
      expect(r.level).toBe('watched');
    });
  });

  describe('adjust', () => {
    it('report delta is -10', async () => {
      const r = await svc.adjust('p1', 'report');
      expect(r.score).toBe(990);
      expect(r.level).toBe('normal');
    });

    it('abandon delta is -20', async () => {
      const r = await svc.adjust('p1', 'abandon');
      expect(r.score).toBe(980);
    });

    it('complete delta is +2', async () => {
      const r = await svc.adjust('p1', 'complete');
      expect(r.score).toBe(1002);
    });

    it('accumulates across multiple adjusts', async () => {
      await svc.adjust('p1', 'report'); // 990
      await svc.adjust('p1', 'report'); // 980
      const r = await svc.adjust('p1', 'abandon'); // 960
      expect(r.score).toBe(960);
    });

    it('transitions level at boundary', async () => {
      // 1000 → 800（20 次举报）→ watched
      for (let i = 0; i < 20; i++) {
        await svc.adjust('p1', 'report');
      }
      const r = await store.get('p1');
      expect(r?.score).toBe(800);
      expect(r?.level).toBe('normal'); // 800 仍属 normal

      await svc.adjust('p1', 'report'); // 790 → watched
      const r2 = await store.get('p1');
      expect(r2?.score).toBe(790);
      expect(r2?.level).toBe('watched');
    });

    it('clamps to floor 0 even with many reports', async () => {
      for (let i = 0; i < 200; i++) {
        await svc.adjust('p1', 'report');
      }
      const r = await store.get('p1');
      expect(r?.score).toBe(0);
      expect(r?.level).toBe('restricted');
    });

    it('clamps to ceiling 1500', async () => {
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
      expect(r1?.score).toBe(990);
      expect(r2?.score).toBe(1002);
    });
  });

  describe('custom initial score', () => {
    it('respects constructor option', async () => {
      const custom = new ReputationService(store, { initialScore: 500 });
      const r = await custom.get('p1');
      expect(r.score).toBe(500);
      expect(r.level).toBe('restricted');
    });
  });
});
