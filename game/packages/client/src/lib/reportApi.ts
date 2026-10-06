// 局后举报：调用服务端的 POST /matches/:id/report
//
// 目标用座位号表示，服务端按座位在这局的成员里解析账号；不传账号 id。
// 同一局同一举报人对同一目标只能举报一次，服务端用唯一约束判重并回 409。

import { ApiRequestError, api } from './api';
import { logger } from './logger';

/** 服务端接受的举报理由；与服务端的白名单一致 */
export const REPORT_REASONS = ['cheating', 'afk', 'abusive', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 说明文字的长度上限；与服务端的校验一致 */
export const REPORT_DESCRIPTION_MAX = 500;

export type ReportFailure =
  | 'duplicate'
  | 'forbidden'
  | 'not_found'
  | 'invalid'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export type ReportOutcome = { ok: true } | { ok: false; code: ReportFailure };

/** 举报通道：联机对局可用，由来源提供 */
export interface ReportChannel {
  submit(seat: string, reason: ReportReason, description?: string): Promise<ReportOutcome>;
}

export function reportOutcomeFromError(err: unknown): ReportOutcome {
  if (!(err instanceof ApiRequestError)) return { ok: false, code: 'network' };
  if (err.status === 0) return { ok: false, code: 'network' };
  if (err.status === 409 || err.code === 'DUPLICATE') return { ok: false, code: 'duplicate' };
  if (err.status === 403) return { ok: false, code: 'forbidden' };
  if (err.status === 404) return { ok: false, code: 'not_found' };
  if (err.status === 429) return { ok: false, code: 'rate_limited' };
  if (err.status === 400 || err.status === 422) return { ok: false, code: 'invalid' };
  return { ok: false, code: 'unknown' };
}

export async function submitMatchReport(
  matchID: string,
  targetSeat: number,
  reason: ReportReason,
  description?: string,
): Promise<ReportOutcome> {
  const text = description?.trim().slice(0, REPORT_DESCRIPTION_MAX) ?? '';
  try {
    await api.post(`/matches/${encodeURIComponent(matchID)}/report`, {
      targetSeat,
      reason,
      ...(text ? { description: text } : {}),
    });
    logger.flow('game/report', 'report submitted', { matchID, targetSeat, reason });
    return { ok: true };
  } catch (err) {
    const outcome = reportOutcomeFromError(err);
    logger.warn('game/report', 'report failed', { matchID, targetSeat, code: outcome });
    return outcome;
  }
}
