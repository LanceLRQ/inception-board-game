// PrismaReportArchive - 基于 Prisma 的 ReportArchive 生产实现
// 对照：docs/_internal/design/08-security-ai.md §8.4b 反作弊与信誉分
//
// W22-B Sprint 2：把 InMemoryReportArchive 的内存行为映射到 PostgreSQL。
// 接口完全对齐 ReportArchive，方便 ReportService / admin API 任意切换注入。

import type { PrismaClient } from '../generated/prisma/client.js';
import type {
  ReportArchive,
  ReportListFilter,
  ReportRecord,
  ReportReason,
  ReportStatus,
  ReportStatusPatch,
} from './ReportService.js';

type PrismaReportRow = {
  id: string;
  matchId: string;
  reporterId: string;
  targetId: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByOperatorId: string | null;
  notes: string | null;
};

/** Prisma row → 领域 ReportRecord */
export function toReportRecord(row: PrismaReportRow): ReportRecord {
  return {
    id: row.id,
    matchID: row.matchId,
    reporterID: row.reporterId,
    targetID: row.targetId,
    reason: row.reason as ReportReason,
    description: row.description,
    status: row.status as ReportStatus,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedByOperatorID: row.resolvedByOperatorId,
    notes: row.notes,
  };
}

export class PrismaReportArchive implements ReportArchive {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(input: Omit<ReportRecord, 'id'>): Promise<ReportRecord> {
    const row = await this.prisma.report.create({
      data: {
        matchId: input.matchID,
        reporterId: input.reporterID,
        targetId: input.targetID,
        reason: input.reason,
        description: input.description,
        status: input.status,
        createdAt: input.createdAt,
        resolvedAt: input.resolvedAt,
        resolvedByOperatorId: input.resolvedByOperatorID,
        notes: input.notes,
      },
    });
    return toReportRecord(row);
  }

  async findById(id: string): Promise<ReportRecord | null> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    return row ? toReportRecord(row) : null;
  }

  async list(filter: ReportListFilter): Promise<ReportRecord[]> {
    const where = buildWhere(filter);
    const rows = await this.prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
    });
    return rows.map(toReportRecord);
  }

  async count(filter: Omit<ReportListFilter, 'limit' | 'offset'>): Promise<number> {
    return this.prisma.report.count({ where: buildWhere(filter) });
  }

  async updateStatus(id: string, patch: ReportStatusPatch): Promise<ReportRecord | null> {
    const existing = await this.prisma.report.findUnique({ where: { id } });
    if (!existing) return null;

    // 与 InMemoryReportArchive 一致的语义：
    //   - status=pending  → 清空 resolvedAt / resolvedByOperatorId（重开案）
    //   - status=其他     → 自动填 resolvedAt=now；operator 有传则覆盖，不传保留原值
    const isPending = patch.status === 'pending';
    const row = await this.prisma.report.update({
      where: { id },
      data: {
        status: patch.status,
        resolvedAt: isPending ? null : new Date(),
        resolvedByOperatorId: isPending
          ? null
          : (patch.resolvedByOperatorID ?? existing.resolvedByOperatorId),
        notes: patch.notes ?? existing.notes,
      },
    });
    return toReportRecord(row);
  }
}

/** 纯函数：把领域 filter 映射为 Prisma where 子句 */
export function buildWhere(
  filter: Omit<ReportListFilter, 'limit' | 'offset'>,
): Record<string, string> {
  const where: Record<string, string> = {};
  if (filter.status !== undefined) where.status = filter.status;
  if (filter.matchID !== undefined) where.matchId = filter.matchID;
  if (filter.targetID !== undefined) where.targetId = filter.targetID;
  if (filter.reporterID !== undefined) where.reporterId = filter.reporterID;
  return where;
}
