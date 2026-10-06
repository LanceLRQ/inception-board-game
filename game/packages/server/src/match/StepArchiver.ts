// 逐步归档队列：每局一条有序队列，后台串行写入归档
//
// 为什么不在每一步里同步写：数据库慢或抖动时会拖慢对局本身；失败后直接丢弃又会让这一步永久缺失。
// 所以每一步先入队、立即返回，由后台按版本号顺序写，失败退避重试；
// 队列超过上限时（数据库长时间不可用）丢弃最旧的并记下缺口，让回放接口能告诉调用方记录不完整。

import { logger } from '../infra/logger.js';
import type { MatchArchive, StepRow } from './MatchArchive.js';
import type { MatchSnapshot } from './MatchStore.js';

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
  /** 对局元信息：步骤与缺口都以它为外键，写成功之前后面的一律不写 */
  start: MatchSnapshot | null;
  rows: StepRow[];
  gaps: GapRange[];
  /** 正在等待 await 归档写入返回 */
  writing: boolean;
  /** 正在写入的缺口：写入循环在等它的 recordGap，不能再改它的范围 */
  writingGap: GapRange | null;
  retryTimer: unknown;
  backoffMs: number;
}

export class StepArchiver {
  private readonly queues = new Map<string, MatchQueue>();
  private readonly waiters = new Set<() => void>();
  /** stop 之后不再收新内容：进程在关停，没有计时器去驱动重试，收下也只会泄漏 */
  private stopped = false;

  constructor(
    private readonly archive: MatchArchive,
    private readonly timers: StepArchiverTimers,
    private readonly limit = STEP_QUEUE_LIMIT,
  ) {}

  /**
   * 对局元信息作为这一局队列的首项：写成功之前这一局的步骤和缺口都不写（它们引用这一行），
   * 失败按同样的退避重试。立即返回，数据库不可用不该挡住开局。
   */
  enqueueStart(snapshot: MatchSnapshot): void {
    if (this.stopped) {
      logger.warn({ matchID: snapshot.matchID }, 'archive stopped, match start dropped');
      return;
    }
    const q = this.queueOf(snapshot.matchID);
    q.start = snapshot;
    this.kick(snapshot.matchID, q, false);
  }

  /** 入队并立即返回；写入在后台进行 */
  enqueue(row: StepRow): void {
    if (this.stopped) {
      logger.warn({ matchID: row.matchID, stateID: row.stateID }, 'archive stopped, step dropped');
      return;
    }
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
    if (this.stopped) {
      logger.warn({ matchID, from, to }, 'archive stopped, gap dropped');
      return;
    }
    const q = this.queueOf(matchID);
    this.addGap(q, from, to);
    this.kick(matchID, q, false);
  }

  /** 等这一局队列写完，写完返回 true；超时只记 ERROR 并返回 false，写入仍会在后台继续重试 */
  async drain(matchID: string, timeoutMs = ARCHIVE_DRAIN_TIMEOUT_MS): Promise<boolean> {
    const q = this.queues.get(matchID);
    if (q) this.kick(matchID, q, true);
    const done = await this.waitUntil(() => !this.queues.has(matchID), timeoutMs);
    if (!done) {
      logger.error({ matchID, pending: this.pendingOf(matchID) }, 'archive drain timed out');
    }
    return done;
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
    this.stopped = true;
    for (const q of this.queues.values()) {
      if (q.retryTimer !== null) this.timers.clearTimeout(q.retryTimer);
    }
    this.queues.clear();
    this.notify();
  }

  pendingOf(matchID: string): number {
    const q = this.queues.get(matchID);
    return q ? q.rows.length + q.gaps.length + (q.start ? 1 : 0) : 0;
  }

  // ---------------------------------------------------------------------------

  private queueOf(matchID: string): MatchQueue {
    let q = this.queues.get(matchID);
    if (!q) {
      q = {
        start: null,
        rows: [],
        gaps: [],
        writing: false,
        writingGap: null,
        retryTimer: null,
        backoffMs: ARCHIVE_RETRY_BASE_MS,
      };
      this.queues.set(matchID, q);
    }
    return q;
  }

  /** 相邻的缺口合并成一段，少写几行；正在写入的那段不动，否则写完被整段移除时会带走新并入的部分 */
  private addGap(q: MatchQueue, from: number, to: number): void {
    const last = q.gaps[q.gaps.length - 1];
    if (last && last !== q.writingGap && last.to + 1 === from) last.to = to;
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
        const start = q.start;
        const gap = start ? undefined : q.gaps[0];
        const row = start ? undefined : q.rows[0];
        if (!start && !gap && !row) break;
        try {
          if (start) {
            await this.archive.recordStart(start);
          } else if (gap) {
            q.writingGap = gap;
            await this.archive.recordGap(matchID, gap.from, gap.to);
          } else await this.archive.appendStep(row!);
        } catch (err) {
          q.writingGap = null;
          this.scheduleRetry(
            matchID,
            q,
            err,
            start ? { start: true } : gap ? { gapTo: gap.to } : { stateID: row!.stateID },
          );
          return;
        }
        if (start) {
          // 写入期间若又入了新的元信息（同一局重建），保留新的
          if (q.start === start) q.start = null;
        } else if (gap) {
          q.gaps.shift();
          q.writingGap = null;
        } else q.rows.shift();
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
    at: { stateID: number } | { gapTo: number } | { start: true },
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
