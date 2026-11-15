// PrismaReportArchive - 基于 Prisma 的 ReportArchive 生产实现
//
// 把 InMemoryReportArchive 的内存行为映射到 PostgreSQL。
// 接口完全对齐 ReportArchive，方便 ReportService / admin API 任意切换注入。

import type { PrismaClient } from '../generated/prisma/client.js';
import { isUuid } from '../infra/uuid.js';
import { createPrismaReputationStore } from './PrismaReputationStore.js';
import { ReputationService } from './ReputationService.js';
import {
  DuplicateReportError,
  type ReportArchive,
  type ReportListFilter,
  type ReportRecord,
  type ReportReason,
  type ReportStatus,
  type ReportStatusPatch,
} from './ReportService.js';

const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const REPORT_THRESHOLD = 3;

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
  constructor(private readonly prisma: Pick<PrismaClient, 'report' | 'match' | '$transaction'>) {}

  async insert(input: Omit<ReportRecord, 'id'>): Promise<ReportRecord> {
    try {
      const data = {
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
      };
      const match = isUuid(data.matchId)
        ? await this.prisma.match.findUnique({
            where: { id: data.matchId },
            select: { mode: true, endedAt: true },
          })
        : null;
      if (match?.mode !== 'matchmaking' || !match.endedAt || match.endedAt > data.createdAt) {
        return toReportRecord(await this.prisma.report.create({ data }));
      }

      const row = await this.prisma.$transaction(
        async (tx) => {
          const target = await lockReportTarget(tx, data.targetId);
          const created = await tx.report.create({ data });
          if (!target) return created;

          // 取锁后再确定窗口，确保并发提交的先后顺序不会遗漏已入库的举报。
          const now = new Date();
          const cutoff = new Date(+now - REPORT_WINDOW_MS);
          const evidence = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM (
            SELECT DISTINCT ON (r."reporter_id") r."id", r."created_at"
            FROM "reports" r
            JOIN "matches" m ON m."id" = CASE
              WHEN pg_input_is_valid(r."match_id", 'uuid') THEN r."match_id"::uuid END
            WHERE r."target_id" = ${data.targetId}
              AND r."created_at" > ${cutoff} AND r."created_at" <= ${now}
              AND r."status" <> 'dismissed' AND NOT r."reputation_applied"
              AND m."mode" = 'matchmaking' AND m."ended_at" <= r."created_at"
            ORDER BY r."reporter_id", r."created_at", r."id"
          ) candidates
          ORDER BY "created_at", "id"
          LIMIT ${REPORT_THRESHOLD}`;
          if (evidence.length === REPORT_THRESHOLD) {
            await tx.report.updateMany({
              where: { id: { in: evidence.map(({ id }) => id) } },
              data: { reputationApplied: true },
            });
            const reputation = new ReputationService(createPrismaReputationStore(tx));
            await reputation.adjust(target, 'report', now);
          }
          return created;
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return toReportRecord(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateReportError();
      throw err;
    }
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
    if (!isUuid(id)) return null;
    const isPending = patch.status === 'pending';
    return this.prisma.$transaction(
      async (tx) => {
        const report = await tx.report.findUnique({ where: { id }, select: { targetId: true } });
        if (!report) return null;
        const target = await lockReportTarget(tx, report.targetId);
        const [row] = await tx.report.updateManyAndReturn({
          where: { id },
          data: {
            status: patch.status,
            resolvedAt: isPending ? null : new Date(),
            ...(isPending
              ? { resolvedByOperatorId: null }
              : patch.resolvedByOperatorID !== undefined && {
                  resolvedByOperatorId: patch.resolvedByOperatorID,
                }),
            ...(patch.notes !== undefined && { notes: patch.notes }),
          },
        });
        if (!row) return null;
        if (
          target &&
          patch.status === 'resolved' &&
          !row.reputationApplied &&
          (row.reason === 'afk' || row.reason === 'cheating') &&
          isUuid(row.matchId)
        ) {
          const match = await tx.match.findUnique({
            where: { id: row.matchId },
            select: { mode: true },
          });
          if (match?.mode === 'matchmaking') {
            const reputation = new ReputationService(createPrismaReputationStore(tx));
            await reputation.adjust(target, 'report');
            await tx.report.update({ where: { id }, data: { reputationApplied: true } });
          }
        }
        return toReportRecord(row);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}

/** 按被举报账号串行执行提交和审核，锁顺序统一为账号、举报、信誉更新。 */
async function lockReportTarget(
  tx: Pick<PrismaClient, '$queryRaw'>,
  targetId: string,
): Promise<string | undefined> {
  if (!isUuid(targetId)) return;
  const [target] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "players" WHERE "id" = ${targetId}::uuid FOR NO KEY UPDATE`;
  return target?.id;
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

/** Prisma 唯一约束冲突的错误码 */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}
