// 逐步归档队列：每局一条有序队列，后台串行写入归档
//
// 为什么不在每一步里同步写：数据库慢或抖动时会拖慢对局本身；失败后直接丢弃又会让这一步永久缺失。
// 所以每一步先入队、立即返回，由后台按版本号顺序写，失败退避重试；
// 队列超过上限时（数据库长时间不可用）丢弃最旧的并记下缺口，让回放接口能告诉调用方记录不完整。

import { logger } from '../infra/logger.js';
import type { MatchArchive, StepRow } from './MatchArchive.js';

/** 每局队列的上限 */
export const STEP_QUEUE_LIMIT = 500;
/** 写入失败后的首次重试间隔，之后翻倍 */
export const ARCHIVE_RETRY_BASE_MS = 1_000;
export const ARCHIVE_RETRY_MAX_MS = 30_000;
/** 对局结束前等待本局步骤写完的默认时限 */
export const ARCHIVE_DRAIN_TIMEOUT_MS = 10_000;

export interface StepArchiverTimers {
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface GapRange {
  from: number;
  to: number;
}

interface MatchQueue {
  rows: StepRow[];
  gaps: GapRange[];
  /** 正在等待 await 归档写入返回 */
  writing: boolean;
  retryTimer: unknown;
  backoffMs: number;
}

export class StepArchiver {
  private readonly queues = new Map<string, MatchQueue>();
  private readonly waiters = new Set<() => void>();

  constructor(
    private readonly archive: MatchArchive,
    private readonly timers: StepArchiverTimers,
    private readonly limit = STEP_QUEUE_LIMIT,
  ) {}

  /** 入队并立即返回；写入在后台进行 */
  enqueue(row: StepRow): void {
    const q = this.queueOf(row.matchID);
    q.rows.push(row);
    if (q.rows.length > this.limit) {
      // 正在写的队首不能丢（丢了会和已落库的行对不上），改丢它后面最旧的一条
      const index = q.writing ? 1 : 0;
      const [dropped] = q.rows.splice(index, 1);
      if (dropped) {
        logger.error(
          { matchID: row.matchID, stateID: dropped.stateID, limit: this.limit },
          'archive queue overflow, dropping oldest step',
        );
        this.addGap(q, dropped.stateID, dropped.stateID);
      }
    }
    this.kick(row.matchID, q, false);
  }

  /** 记一段缺口（写入同样走队列重试）；起止版本号都包含在内 */
  enqueueGap(matchID: string, from: number, to: number): void {
    const q = this.queueOf(matchID);
    this.addGap(q, from, to);
    this.kick(matchID, q, false);
  }

  /** 等这一局队列写完；超时只记 ERROR 并返回，写入仍会在后台继续重试 */
  async drain(matchID: string, timeoutMs = ARCHIVE_DRAIN_TIMEOUT_MS): Promise<void> {
    const q = this.queues.get(matchID);
    if (q) this.kick(matchID, q, true);
    const done = await this.waitUntil(() => !this.queues.has(matchID), timeoutMs);
    if (!done) {
      logger.error({ matchID, pending: this.pendingOf(matchID) }, 'archive drain timed out');
    }
  }

  /** 等所有队列写完或超时，返回未写完的条数（步骤加缺口） */
  async flush(timeoutMs: number): Promise<number> {
    for (const [matchID, q] of this.queues) this.kick(matchID, q, true);
    await this.waitUntil(() => this.queues.size === 0, timeoutMs);
    let remaining = 0;
    for (const matchID of this.queues.keys()) remaining += this.pendingOf(matchID);
    return remaining;
  }

  /** 丢弃一局的队列（对局被撤销，不会再有归档） */
  discard(matchID: string): void {
    const q = this.queues.get(matchID);
    if (!q) return;
    if (q.retryTimer !== null) this.timers.clearTimeout(q.retryTimer);
    this.queues.delete(matchID);
    this.notify();
  }

  /** 停掉所有重试计时器；队列里没写完的内容丢弃 */
  stop(): void {
    for (const q of this.queues.values()) {
      if (q.retryTimer !== null) this.timers.clearTimeout(q.retryTimer);
    }
    this.queues.clear();
    this.notify();
  }

  pendingOf(matchID: string): number {
    const q = this.queues.get(matchID);
    return q ? q.rows.length + q.gaps.length : 0;
  }

  // ---------------------------------------------------------------------------

  private queueOf(matchID: string): MatchQueue {
    let q = this.queues.get(matchID);
    if (!q) {
      q = {
        rows: [],
        gaps: [],
        writing: false,
        retryTimer: null,
        backoffMs: ARCHIVE_RETRY_BASE_MS,
      };
      this.queues.set(matchID, q);
    }
    return q;
  }

  /** 相邻的缺口合并成一段，少写几行 */
  private addGap(q: MatchQueue, from: number, to: number): void {
    const last = q.gaps[q.gaps.length - 1];
    if (last && last.to + 1 === from) last.to = to;
    else q.gaps.push({ from, to });
  }

  /** immediate 为真时取消退避等待、马上重试（对局结束与进程关停时用） */
  private kick(matchID: string, q: MatchQueue, immediate: boolean): void {
    if (q.writing) return;
    if (q.retryTimer !== null) {
      if (!immediate) return;
      this.timers.clearTimeout(q.retryTimer);
      q.retryTimer = null;
    }
    void this.pump(matchID, q);
  }

  private async pump(matchID: string, q: MatchQueue): Promise<void> {
    q.writing = true;
    try {
      for (;;) {
        if (this.queues.get(matchID) !== q) return;
        const gap = q.gaps[0];
        const row = q.rows[0];
        if (!gap && !row) break;
        try {
          if (gap) await this.archive.recordGap(matchID, gap.from, gap.to);
          else await this.archive.appendStep(row!);
        } catch (err) {
          this.scheduleRetry(matchID, q, err, gap ? { gapTo: gap.to } : { stateID: row!.stateID });
          return;
        }
        if (gap) q.gaps.shift();
        else q.rows.shift();
        q.backoffMs = ARCHIVE_RETRY_BASE_MS;
      }
      if (this.queues.get(matchID) === q) this.queues.delete(matchID);
    } finally {
      q.writing = false;
      this.notify();
    }
  }

  private scheduleRetry(
    matchID: string,
    q: MatchQueue,
    err: unknown,
    at: { stateID: number } | { gapTo: number },
  ): void {
    const delay = q.backoffMs;
    q.backoffMs = Math.min(q.backoffMs * 2, ARCHIVE_RETRY_MAX_MS);
    logger.error({ matchID, ...at, retryInMs: delay, err }, 'archive write failed, will retry');
    // 队列可能在写入期间被 discard / stop 清掉，那就不再重试
    if (this.queues.get(matchID) !== q) return;
    q.retryTimer = this.timers.setTimeout(() => {
      q.retryTimer = null;
      if (this.queues.get(matchID) === q) void this.pump(matchID, q);
    }, delay);
  }

  private notify(): void {
    for (const w of [...this.waiters]) w();
  }

  /** 条件成立返回 true；超时返回 false */
  private waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
    if (cond()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const finish = (ok: boolean): void => {
        this.waiters.delete(check);
        this.timers.clearTimeout(handle);
        resolve(ok);
      };
      const check = (): void => {
        if (cond()) finish(true);
      };
      const handle = this.timers.setTimeout(() => finish(false), timeoutMs);
      this.waiters.add(check);
    });
  }
}
