// ReportService - 举报收集 + 触发信誉分扣减
// 对照：plans/design/08-security-ai.md §8.4b 反作弊与信誉分
//
// 规则：
//   - 不能自举（senderID === targetID → 拒绝）
//   - 同一局内同一举报者对同一目标只能举报 1 次
//   - 举报理由白名单（cheating / afk / abusive / other）
//   - 每次有效举报 → targetID 信誉分 -10
//   - Report 历史暂用日志归档（Phase 5 升级独立表）

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

export interface ReportServiceOptions {
  readonly now?: () => Date;
}

export class ReportService {
  /** `${matchID}:${reporterID}:${targetID}` → submitted at */
  private readonly recent = new Map<string, number>();
  private readonly now: () => Date;

  constructor(
    private readonly reputation: ReputationService,
    opts: ReportServiceOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
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
