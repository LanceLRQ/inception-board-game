import { describe, it, expect, beforeEach } from 'vitest';
import { ReportService, InMemoryReportArchive } from './ReportService.js';
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

// === W22-B · ReportArchive 持久化 + 运营查询 ===

describe('ReportService · 注入 ReportArchive 后', () => {
  let archive: InMemoryReportArchive;
  let svc: ReportService;

  beforeEach(() => {
    archive = new InMemoryReportArchive();
    const rep = new ReputationService(new InMemoryReputationStore());
    svc = new ReportService(rep, { archive });
  });

  it('成功提交后 archive 持久化一条 pending 记录', async () => {
    await svc.submit({ matchID: 'm1', reporterID: 'p1', targetID: 'p2', reason: 'cheating' });
    const all = await archive.list({});
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe('pending');
    expect(all[0]!.matchID).toBe('m1');
    expect(all[0]!.reason).toBe('cheating');
    expect(all[0]!.resolvedAt).toBeNull();
  });

  it('被拒绝的举报（如自举）不进 archive', async () => {
    await svc.submit({ matchID: 'm1', reporterID: 'p1', targetID: 'p1', reason: 'cheating' });
    expect(archive.size()).toBe(0);
  });

  it('description 截断到 500 字符', async () => {
    const longDesc = 'x'.repeat(700);
    await svc.submit({
      matchID: 'm1',
      reporterID: 'p1',
      targetID: 'p2',
      reason: 'other',
      description: longDesc,
    });
    const all = await archive.list({});
    expect(all[0]!.description!.length).toBe(500);
  });
});

describe('InMemoryReportArchive · 查询', () => {
  let archive: InMemoryReportArchive;

  beforeEach(async () => {
    archive = new InMemoryReportArchive();
    const seed = async (m: string, r: string, t: string, reason: 'afk' | 'cheating') => {
      await archive.insert({
        matchID: m,
        reporterID: r,
        targetID: t,
        reason,
        description: null,
        status: 'pending',
        createdAt: new Date(2026, 3, 23, 10, 0, archive.size()),
        resolvedAt: null,
        resolvedByOperatorID: null,
        notes: null,
      });
    };
    await seed('m1', 'p1', 'pTarget', 'afk');
    await seed('m1', 'p2', 'pTarget', 'cheating');
    await seed('m2', 'p1', 'pOther', 'afk');
  });

  it('list 无 filter → 全部，按 createdAt 倒序', async () => {
    const all = await archive.list({});
    expect(all).toHaveLength(3);
    // 最后插入的 createdAt 秒数最大 → 排第一
    expect(all[0]!.id).toBe('r-3');
    expect(all[2]!.id).toBe('r-1');
  });

  it('list filter by matchID', async () => {
    const m1 = await archive.list({ matchID: 'm1' });
    expect(m1).toHaveLength(2);
    expect(m1.every((r) => r.matchID === 'm1')).toBe(true);
  });

  it('list filter by targetID', async () => {
    const target = await archive.list({ targetID: 'pTarget' });
    expect(target).toHaveLength(2);
  });

  it('list filter by status', async () => {
    expect(await archive.list({ status: 'pending' })).toHaveLength(3);
    expect(await archive.list({ status: 'resolved' })).toHaveLength(0);
  });

  it('list 分页 limit + offset', async () => {
    const page1 = await archive.list({ limit: 2, offset: 0 });
    const page2 = await archive.list({ limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
  });

  it('count filter', async () => {
    expect(await archive.count({ matchID: 'm1' })).toBe(2);
    expect(await archive.count({})).toBe(3);
  });
});

describe('InMemoryReportArchive · 状态流转', () => {
  let archive: InMemoryReportArchive;
  let recordId: string;

  beforeEach(async () => {
    archive = new InMemoryReportArchive();
    const r = await archive.insert({
      matchID: 'm1',
      reporterID: 'p1',
      targetID: 'p2',
      reason: 'cheating',
      description: 'too aggressive',
      status: 'pending',
      createdAt: new Date(),
      resolvedAt: null,
      resolvedByOperatorID: null,
      notes: null,
    });
    recordId = r.id;
  });

  it('updateStatus → resolved 设置 resolvedAt + operator', async () => {
    const updated = await archive.updateStatus(recordId, {
      status: 'resolved',
      resolvedByOperatorID: 'op-1',
      notes: 'verified by replay',
    });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('resolved');
    expect(updated!.resolvedAt).toBeInstanceOf(Date);
    expect(updated!.resolvedByOperatorID).toBe('op-1');
    expect(updated!.notes).toBe('verified by replay');
  });

  it('updateStatus → dismissed 同样填 resolvedAt', async () => {
    const updated = await archive.updateStatus(recordId, {
      status: 'dismissed',
      resolvedByOperatorID: 'op-2',
    });
    expect(updated!.status).toBe('dismissed');
    expect(updated!.resolvedAt).toBeInstanceOf(Date);
  });

  it('updateStatus → pending 清空 resolvedAt + operator（重开案）', async () => {
    await archive.updateStatus(recordId, { status: 'resolved', resolvedByOperatorID: 'op-1' });
    const reopened = await archive.updateStatus(recordId, { status: 'pending' });
    expect(reopened!.status).toBe('pending');
    expect(reopened!.resolvedAt).toBeNull();
    expect(reopened!.resolvedByOperatorID).toBeNull();
  });

  it('updateStatus 不存在的 id → null', async () => {
    const r = await archive.updateStatus('not-exist', { status: 'resolved' });
    expect(r).toBeNull();
  });

  it('findById 命中', async () => {
    const r = await archive.findById(recordId);
    expect(r).not.toBeNull();
    expect(r!.matchID).toBe('m1');
  });

  it('findById 未命中', async () => {
    expect(await archive.findById('ghost')).toBeNull();
  });
});
