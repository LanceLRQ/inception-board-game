// PrismaReportArchive · 纯函数单元测试
// W22-B Sprint 2（不连 DB，只覆盖映射 + where 构造）

import { describe, it, expect } from 'vitest';
import { buildWhere, toReportRecord } from './PrismaReportArchive.js';

describe('PrismaReportArchive · buildWhere', () => {
  it('空 filter → 空 where', () => {
    expect(buildWhere({})).toEqual({});
  });

  it('status 映射保持原 key', () => {
    expect(buildWhere({ status: 'pending' })).toEqual({ status: 'pending' });
  });

  it('领域 matchID/targetID/reporterID → Prisma matchId/targetId/reporterId', () => {
    const w = buildWhere({ matchID: 'm1', targetID: 't1', reporterID: 'r1' });
    expect(w).toEqual({ matchId: 'm1', targetId: 't1', reporterId: 'r1' });
  });

  it('undefined 字段不进 where', () => {
    const w = buildWhere({ status: 'resolved', matchID: undefined });
    expect('matchId' in w).toBe(false);
    expect(w.status).toBe('resolved');
  });
});

describe('PrismaReportArchive · toReportRecord', () => {
  const NOW = new Date('2026-04-24T10:00:00Z');

  it('完整映射（pending 态）', () => {
    const record = toReportRecord({
      id: 'uuid-1',
      matchId: 'm1',
      reporterId: 'p1',
      targetId: 'p2',
      reason: 'cheating',
      description: 'xyz',
      status: 'pending',
      createdAt: NOW,
      resolvedAt: null,
      resolvedByOperatorId: null,
      notes: null,
    });
    expect(record).toEqual({
      id: 'uuid-1',
      matchID: 'm1',
      reporterID: 'p1',
      targetID: 'p2',
      reason: 'cheating',
      description: 'xyz',
      status: 'pending',
      createdAt: NOW,
      resolvedAt: null,
      resolvedByOperatorID: null,
      notes: null,
    });
  });

  it('resolved 态保留审计字段', () => {
    const record = toReportRecord({
      id: 'uuid-2',
      matchId: 'm1',
      reporterId: 'p1',
      targetId: 'p2',
      reason: 'afk',
      description: null,
      status: 'resolved',
      createdAt: NOW,
      resolvedAt: NOW,
      resolvedByOperatorId: 'op-1',
      notes: 'verified',
    });
    expect(record.status).toBe('resolved');
    expect(record.resolvedByOperatorID).toBe('op-1');
    expect(record.resolvedAt).toBe(NOW);
    expect(record.notes).toBe('verified');
  });
});
