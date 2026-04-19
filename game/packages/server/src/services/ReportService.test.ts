import { describe, it, expect, beforeEach } from 'vitest';
import { ReportService } from './ReportService.js';
import { ReputationService, InMemoryReputationStore } from './ReputationService.js';

describe('ReportService', () => {
  let rep: ReputationService;
  let svc: ReportService;
  let store: InMemoryReputationStore;

  beforeEach(() => {
    store = new InMemoryReputationStore();
    rep = new ReputationService(store);
    svc = new ReportService(rep);
  });

  describe('validation', () => {
    it('rejects self-report', async () => {
      const r = await svc.submit({
        matchID: 'm1',
        reporterID: 'p1',
        targetID: 'p1',
        reason: 'cheating',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('SELF_REPORT');
    });

    it('rejects invalid reason', async () => {
      const r = await svc.submit({
        matchID: 'm1',
        reporterID: 'p1',
        targetID: 'p2',
        reason: 'totally_made_up' as 'cheating',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_REASON');
    });

    it('rejects empty target', async () => {
      const r = await svc.submit({
        matchID: 'm1',
        reporterID: 'p1',
        targetID: '',
        reason: 'cheating',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_TARGET');
    });
  });

  describe('successful submit', () => {
    it('deducts 10 score from target', async () => {
      const r = await svc.submit({
        matchID: 'm1',
        reporterID: 'p1',
        targetID: 'p2',
        reason: 'afk',
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.targetNewScore).toBe(990);
    });

    it('does not affect the reporter', async () => {
      await svc.submit({
        matchID: 'm1',
        reporterID: 'p1',
        targetID: 'p2',
        reason: 'afk',
      });
      const reporterRec = await rep.get('p1');
      expect(reporterRec.score).toBe(1000);
    });

    it('accepts all 4 valid reasons', async () => {
      const reasons = ['cheating', 'afk', 'abusive', 'other'] as const;
      for (const reason of reasons) {
        const r = await svc.submit({
          matchID: `m-${reason}`,
          reporterID: 'p1',
          targetID: 'p2',
          reason,
        });
        expect(r.ok).toBe(true);
      }
      // p2 被扣 4 次 × -10 = 960
      const rec = await rep.get('p2');
      expect(rec.score).toBe(960);
    });
  });

  describe('duplicate prevention', () => {
    it('rejects second report from same reporter on same target in same match', async () => {
      await svc.submit({
        matchID: 'm1',
        reporterID: 'p1',
        targetID: 'p2',
        reason: 'afk',
      });
      const r2 = await svc.submit({
        matchID: 'm1',
        reporterID: 'p1',
        targetID: 'p2',
        reason: 'cheating',
      });
      expect(r2.ok).toBe(false);
      if (!r2.ok) expect(r2.code).toBe('DUPLICATE');
      // 第二次不扣分，分数应仍是 990
      const rec = await rep.get('p2');
      expect(rec.score).toBe(990);
    });

    it('different reporters can each report same target once', async () => {
      await svc.submit({ matchID: 'm1', reporterID: 'p1', targetID: 'p3', reason: 'afk' });
      const r2 = await svc.submit({
        matchID: 'm1',
        reporterID: 'p2',
        targetID: 'p3',
        reason: 'afk',
      });
      expect(r2.ok).toBe(true);
      const rec = await rep.get('p3');
      expect(rec.score).toBe(980);
    });

    it('different matches: same pair can report again', async () => {
      await svc.submit({ matchID: 'm1', reporterID: 'p1', targetID: 'p2', reason: 'afk' });
      const r2 = await svc.submit({
        matchID: 'm2',
        reporterID: 'p1',
        targetID: 'p2',
        reason: 'afk',
      });
      expect(r2.ok).toBe(true);
    });
  });

  describe('disposeMatch', () => {
    it('clears the dedup records for that match', async () => {
      await svc.submit({ matchID: 'm1', reporterID: 'p1', targetID: 'p2', reason: 'afk' });
      svc.disposeMatch('m1');
      const r = await svc.submit({
        matchID: 'm1',
        reporterID: 'p1',
        targetID: 'p2',
        reason: 'afk',
      });
      // 已清理，应当再次允许（符合"对局结束清理"语义）
      expect(r.ok).toBe(true);
    });

    it('does not clear other matches', async () => {
      await svc.submit({ matchID: 'm1', reporterID: 'p1', targetID: 'p2', reason: 'afk' });
      await svc.submit({ matchID: 'm2', reporterID: 'p1', targetID: 'p2', reason: 'afk' });
      svc.disposeMatch('m1');
      const r = await svc.submit({
        matchID: 'm2',
        reporterID: 'p1',
        targetID: 'p2',
        reason: 'afk',
      });
      expect(r.ok).toBe(false);
    });
  });
});
