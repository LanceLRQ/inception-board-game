// ReportService - 举报收集 + 触发信誉分扣减
// 对照：plans/design/08-security-ai.md §8.4b 反作弊与信誉分
//
// 规则：
//   - 不能自举（senderID === targetID → 拒绝）
//   - 同一局内同一举报者对同一目标只能举报 1 次
//   - 举报理由白名单（cheating / afk / abusive / other）
//   - 每次有效举报 → targetID 信誉分 -10
//   - W22-B：可选 archive 持久化（运营面板审核源）；不传则保持原 logger 归档行为
//
// W22-B 新增：ReportArchive 抽象 — 用于运营审核面板的查询 / 状态流转
//   - insert / findById / list（按筛选） / count / updateStatus
//   - InMemoryReportArchive 默认实现（开发 / 测试用）
//   - Phase 5 可由 PrismaReportArchive 替换

import { logger } from '../infra/logger.js';
import type { ReputationService } from './ReputationService.js';

export type ReportReason = 'cheating' | 'afk' | 'abusive' | 'other';
export const VALID_REPORT_REASONS: readonly ReportReason[] = [
  'cheating',
  'afk',
  'abusive',
  'other',
];

export interface SubmitReportInput {
  readonly matchID: string;
  readonly reporterID: string;
  readonly targetID: string;
  readonly reason: ReportReason;
  readonly description?: string;
}

export type ReportResult =
  | {
      readonly ok: true;
      readonly targetNewScore: number;
    }
  | {
      readonly ok: false;
      readonly code: 'SELF_REPORT' | 'DUPLICATE' | 'INVALID_REASON' | 'INVALID_TARGET';
    };

// === W22-B · 持久化 archive ===

export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

export interface ReportRecord {
  readonly id: string;
  readonly matchID: string;
  readonly reporterID: string;
  readonly targetID: string;
  readonly reason: ReportReason;
  readonly description: string | null;
  readonly status: ReportStatus;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly resolvedByOperatorID: string | null;
  readonly notes: string | null;
}

export interface ReportListFilter {
  readonly status?: ReportStatus;
  readonly matchID?: string;
  readonly targetID?: string;
  readonly reporterID?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ReportStatusPatch {
  readonly status: ReportStatus;
  readonly resolvedByOperatorID?: string;
  readonly notes?: string;
}

export interface ReportArchive {
  insert(input: Omit<ReportRecord, 'id'>): Promise<ReportRecord>;
  findById(id: string): Promise<ReportRecord | null>;
  list(filter: ReportListFilter): Promise<ReportRecord[]>;
  count(filter: Omit<ReportListFilter, 'limit' | 'offset'>): Promise<number>;
  updateStatus(id: string, patch: ReportStatusPatch): Promise<ReportRecord | null>;
}

export interface ReportServiceOptions {
  readonly now?: () => Date;
  readonly archive?: ReportArchive;
}

export class ReportService {
  /** `${matchID}:${reporterID}:${targetID}` → submitted at */
  private readonly recent = new Map<string, number>();
  private readonly now: () => Date;
  private readonly archive: ReportArchive | undefined;

  constructor(
    private readonly reputation: ReputationService,
    opts: ReportServiceOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.archive = opts.archive;
  }

  async submit(input: SubmitReportInput): Promise<ReportResult> {
    if (!input.targetID || typeof input.targetID !== 'string') {
      return { ok: false, code: 'INVALID_TARGET' };
    }
    if (!VALID_REPORT_REASONS.includes(input.reason)) {
      return { ok: false, code: 'INVALID_REASON' };
    }
    if (input.reporterID === input.targetID) {
      return { ok: false, code: 'SELF_REPORT' };
    }

    const key = `${input.matchID}:${input.reporterID}:${input.targetID}`;
    if (this.recent.has(key)) {
      return { ok: false, code: 'DUPLICATE' };
    }
    this.recent.set(key, this.now().getTime());

    const updated = await this.reputation.adjust(input.targetID, 'report');

    // 持久化到 archive（运营可查询）；失败仅 warn，不阻塞主流程
    if (this.archive) {
      try {
        await this.archive.insert({
          matchID: input.matchID,
          reporterID: input.reporterID,
          targetID: input.targetID,
          reason: input.reason,
          description: input.description?.slice(0, 500) ?? null,
          status: 'pending',
          createdAt: this.now(),
          resolvedAt: null,
          resolvedByOperatorID: null,
          notes: null,
        });
      } catch (err) {
        logger.warn({ err, matchID: input.matchID }, 'report archive failed');
      }
    }

    logger.info(
      {
        matchID: input.matchID,
        reporterID: input.reporterID,
        targetID: input.targetID,
        reason: input.reason,
        description: input.description?.slice(0, 200) ?? null,
        targetNewScore: updated.score,
        targetLevel: updated.level,
      },
      'report submitted',
    );

    return { ok: true, targetNewScore: updated.score };
  }

  /** 对局结束：清理该 match 的重复防护记录（Phase 5 改 Redis 带 TTL） */
  disposeMatch(matchID: string): void {
    const prefix = `${matchID}:`;
    for (const k of this.recent.keys()) {
      if (k.startsWith(prefix)) this.recent.delete(k);
    }
  }
}

// === 内存 ReportArchive 实现（开发 / 测试用 · Phase 5 升级 PrismaReportArchive）===

export class InMemoryReportArchive implements ReportArchive {
  private readonly records = new Map<string, ReportRecord>();
  private idCounter = 0;

  async insert(input: Omit<ReportRecord, 'id'>): Promise<ReportRecord> {
    this.idCounter += 1;
    const record: ReportRecord = { ...input, id: `r-${this.idCounter}` };
    this.records.set(record.id, record);
    return record;
  }

  async findById(id: string): Promise<ReportRecord | null> {
    return this.records.get(id) ?? null;
  }

  async list(filter: ReportListFilter): Promise<ReportRecord[]> {
    let arr = [...this.records.values()];
    if (filter.status !== undefined) arr = arr.filter((r) => r.status === filter.status);
    if (filter.matchID !== undefined) arr = arr.filter((r) => r.matchID === filter.matchID);
    if (filter.targetID !== undefined) arr = arr.filter((r) => r.targetID === filter.targetID);
    if (filter.reporterID !== undefined)
      arr = arr.filter((r) => r.reporterID === filter.reporterID);
    // 默认按 createdAt 倒序（最新在前）便于面板列表
    arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    return arr.slice(offset, offset + limit);
  }

  async count(filter: Omit<ReportListFilter, 'limit' | 'offset'>): Promise<number> {
    return (await this.list({ ...filter, limit: Number.MAX_SAFE_INTEGER, offset: 0 })).length;
  }

  async updateStatus(id: string, patch: ReportStatusPatch): Promise<ReportRecord | null> {
    const existing = this.records.get(id);
    if (!existing) return null;
    const updated: ReportRecord = {
      ...existing,
      status: patch.status,
      resolvedAt: patch.status === 'pending' ? null : new Date(),
      resolvedByOperatorID:
        patch.status === 'pending'
          ? null
          : (patch.resolvedByOperatorID ?? existing.resolvedByOperatorID),
      notes: patch.notes ?? existing.notes,
    };
    this.records.set(id, updated);
    return updated;
  }

  /** 测试辅助：清空 */
  clear(): void {
    this.records.clear();
    this.idCounter = 0;
  }

  size(): number {
    return this.records.size;
  }
}
