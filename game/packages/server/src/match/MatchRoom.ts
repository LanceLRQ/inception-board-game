// 对局房间：一局对局在服务端内存里的串行执行器
//
// 所有改变状态的操作（玩家提交、Bot 自动步、超时代发）排进同一条 Promise 链，
// 前一个完全结束（含快照写入与归档回调）后下一个才开始。
// 房间不认识账号、连接、Redis 与数据库，这些都通过 RoomDeps 注入。

import type { SetupState } from '@icgame/game-engine/setup';
import {
  applyMove,
  type GameDef,
  type MatchEvent,
  type MatchState,
  type MoveRequest,
  type RejectReason,
} from '@icgame/game-engine/runner';
import { logger } from '../infra/logger.js';
import { planNext, timeoutAction, type TimingConfig } from './scheduling.js';

export interface RoomSeat {
  seat: string;
  /** 账号 id，房间只原样保存 */
  playerId: string | null;
  nickname: string;
  isBot: boolean;
}

export interface StepOutput {
  state: MatchState<SetupState>;
  /** 完整事件，未裁剪 */
  events: MatchEvent[];
  request: MoveRequest;
  source: 'player' | 'bot' | 'timeout';
  deadlineAt: number | null;
}

export interface RoomDeps {
  game: GameDef<SetupState>;
  /** 写快照；返回 'conflict' 表示版本对不上 */
  persist(state: MatchState<SetupState>, expectedStateID: number): Promise<'ok' | 'conflict'>;
  /** 一步被接受并写完快照后调用；它抛错不影响对局 */
  onStep(output: StepOutput): void | Promise<void>;
  onGameOver(state: MatchState<SetupState>): void | Promise<void>;
  /** 某个真人座位此刻是否由 Bot 接管 */
  isTakenOver(seat: string): boolean;
  /**
   * 读取库里已存的版本号，没有快照返回 null。
   * 写入重试时用来分辨「写成功但应答丢了」与真正的版本冲突。
   */
  loadStoredVersion?(): Promise<number | null>;
  /** 写快照遇到真正的版本冲突、房间自行关闭时调用一次；它抛错不影响关闭 */
  onFatal?(reason: 'persist_conflict'): void;
  /** 存储在「不可用」与「正常」之间切换时各通知一次；它抛错不影响对局 */
  onStorageHealth?(healthy: boolean): void;
  timing: TimingConfig;
  timers: {
    setTimeout(cb: () => void, ms: number): unknown;
    clearTimeout(h: unknown): void;
    now(): number;
  };
}

export type SubmitResult =
  | { ok: true; stateID: number }
  | {
      ok: false;
      code: 'duplicate_intent' | 'stale_state' | 'match_over' | 'internal_error' | RejectReason;
    };

/** 幂等表容量 */
const INTENT_CAPACITY = 256;
/** 自动步连续被拒、或截止到点连续取不到动作的上限 */
const MAX_AUTO_FAILURES = 3;
/** 一步内写快照失败后的快速重试间隔；用尽仍失败才算这一步失败 */
const PERSIST_RETRY_DELAYS_MS = [100, 400] as const;
/** 存储不可用期间自动步的退避：起点、上限（每次翻倍） */
const STORAGE_BACKOFF_START_MS = 1_000;
const STORAGE_BACKOFF_MAX_MS = 30_000;

export class MatchRoom {
  readonly matchID: string;

  private state: MatchState<SetupState>;
  private readonly seatList: readonly RoomSeat[];
  private readonly deps: RoomDeps;

  private tail: Promise<void> = Promise.resolve();
  private started = false;
  private closed = false;
  private over = false;

  private timer: unknown = null;
  private deadline: number | null = null;
  /** 每次重新排程加 1，已入队但过期的计时任务据此丢弃 */
  private generation = 0;
  private autoRejects = 0;
  private timeoutMisses = 0;
  /** 快照存储当前是否不可用；不可用期间自动步不计入失败上限，改按退避重试 */
  private storageUnhealthy = false;
  private storageBackoffMs = STORAGE_BACKOFF_START_MS;

  /** `${座位}:${intentId}` → 结果，按插入顺序先进先出 */
  private readonly intents = new Map<string, SubmitResult>();

  constructor(
    matchID: string,
    seats: readonly RoomSeat[],
    initial: MatchState<SetupState>,
    deps: RoomDeps,
  ) {
    this.matchID = matchID;
    this.seatList = seats;
    this.state = initial;
    this.deps = deps;
  }

  start(): void {
    if (this.started || this.closed) return;
    this.started = true;
    logger.info({ matchID: this.matchID, stateID: this.state.stateID }, 'room scheduling started');
    this.schedule();
  }

  submit(
    seat: string,
    input: { move: string; args: unknown[]; intentId: string; stateID?: number },
  ): Promise<SubmitResult> {
    return this.enqueue(async () => {
      if (this.closed || this.over) return { ok: false, code: 'match_over' };

      const intentKey = `${seat}:${input.intentId}`;
      const known = this.intents.get(intentKey);
      if (known !== undefined) return known;

      if (input.stateID !== undefined && input.stateID !== this.state.stateID) {
        return { ok: false, code: 'stale_state' };
      }

      const request: MoveRequest = { playerID: seat, move: input.move, args: input.args };
      const outcome = await this.step(request, 'player');
      this.remember(intentKey, outcome);
      return outcome;
    });
  }

  /**
   * 接管状态或在线状态变了，重新排程。
   * 已挂着的计时器与新计划同类时不重挂：连接的建立与断开不能把已经走掉的等待时间清零。
   * 内部异常只记日志，不向调用方（连接监听器）传播。
   */
  reschedule(): void {
    if (!this.started || this.closed) return;
    this.autoRejects = 0;
    try {
      this.schedule(true);
    } catch (err) {
      logger.error(
        { matchID: this.matchID, stateID: this.state.stateID, err },
        'reschedule failed',
      );
    }
  }

  current(): MatchState<SetupState> {
    return this.state;
  }

  deadlineAt(): number | null {
    return this.deadline;
  }

  /** 快照存储此刻是否可用（供新连接建立时补发提示） */
  isStorageHealthy(): boolean {
    return !this.storageUnhealthy;
  }

  seats(): readonly RoomSeat[] {
    return this.seatList;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearTimer();
    logger.info({ matchID: this.matchID, stateID: this.state.stateID }, 'room closed');
  }

  /** 因快照版本冲突而关闭：先关，再通知一次 */
  private fatal(reason: 'persist_conflict'): void {
    const alreadyClosed = this.closed;
    this.close();
    if (alreadyClosed) return;
    try {
      this.deps.onFatal?.(reason);
    } catch (err) {
      logger.error({ matchID: this.matchID, err }, 'onFatal failed');
    }
  }

  /** 仅供测试：等队列（含排程之后新入队的任务）全部跑完 */
  async idle(): Promise<void> {
    let seen: Promise<void>;
    do {
      seen = this.tail;
      await seen;
    } while (seen !== this.tail);
  }

  // ---------------------------------------------------------------------------

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.tail.then(job);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private humanSeats(): string[] {
    return this.seatList
      .filter((s) => !s.isBot && !this.deps.isTakenOver(s.seat))
      .map((s) => s.seat);
  }

  private clearTimer(): void {
    this.generation += 1;
    if (this.timer !== null) {
      this.deps.timers.clearTimeout(this.timer);
      this.timer = null;
    }
    this.deadline = null;
  }

  private remember(intentId: string, result: SubmitResult): void {
    // internal_error 是存储写入失败，这一步并没有生效：记住它会让存储恢复后的重试拿到旧的失败结果
    if (
      !result.ok &&
      (result.code === 'stale_state' ||
        result.code === 'match_over' ||
        result.code === 'internal_error')
    ) {
      return;
    }
    this.intents.set(intentId, result);
    if (this.intents.size > INTENT_CAPACITY) {
      const oldest = this.intents.keys().next().value;
      if (oldest !== undefined) this.intents.delete(oldest);
    }
  }

  /**
   * 按当前状态挂一个计时器（自动行动的短延迟或截止）。
   * keepExisting 为真时，与已挂计时器同类的计划沿用原计时器：
   * 截止只会提前、不会推后；自动步的延迟不重新计时。
   */
  private schedule(keepExisting = false): void {
    if (this.closed || this.over || this.autoRejects >= MAX_AUTO_FAILURES) {
      this.clearTimer();
      return;
    }

    // 存储不可用时已挂着退避计时器：座位状态变化不能把它换成短延迟，否则会绕过退避
    if (keepExisting && this.storageUnhealthy && this.timer !== null) return;

    const plan = planNext(this.state, this.humanSeats(), this.deps.timing);
    if (
      plan.kind === 'none' ||
      (plan.kind === 'deadline' && this.timeoutMisses >= MAX_AUTO_FAILURES)
    ) {
      this.clearTimer();
      return;
    }

    const { timers } = this.deps;
    let delayMs = plan.delayMs;
    if (keepExisting && this.timer !== null) {
      if (plan.kind === 'auto' && this.deadline === null) return;
      if (plan.kind === 'deadline' && this.deadline !== null) {
        const target = Math.min(this.deadline, timers.now() + plan.delayMs);
        if (target >= this.deadline) return;
        delayMs = Math.max(0, target - timers.now());
      }
    }

    this.clearTimer();
    const gen = this.generation;
    if (plan.kind === 'deadline') this.deadline = timers.now() + delayMs;
    this.timer = timers.setTimeout(() => {
      this.timer = null;
      void this.enqueue(() => (plan.kind === 'auto' ? this.runAuto(gen) : this.runTimeout(gen)));
    }, delayMs);
  }

  private async runAuto(gen: number): Promise<void> {
    if (gen !== this.generation || this.closed || this.over) return;
    try {
      const plan = planNext(this.state, this.humanSeats(), this.deps.timing);
      if (plan.kind !== 'auto') {
        this.schedule();
        return;
      }
      const { action } = plan;
      logger.debug(
        { matchID: this.matchID, seat: action.playerID, move: action.move },
        'bot decided',
      );
      const outcome = await this.step(
        { playerID: action.playerID, move: action.move, args: action.args },
        'bot',
      );
      this.afterAutomatic(outcome, 'auto');
    } catch (err) {
      logger.error(
        { matchID: this.matchID, stateID: this.state.stateID, err },
        'automatic move threw',
      );
      this.countAutoFailure('auto', 'exception');
    }
  }

  private async runTimeout(gen: number): Promise<void> {
    if (gen !== this.generation || this.closed || this.over) return;
    try {
      const action = timeoutAction(this.state);
      if (action === null) {
        this.timeoutMisses += 1;
        if (this.timeoutMisses >= MAX_AUTO_FAILURES) {
          logger.error({ matchID: this.matchID }, 'deadline fired but no action, giving up');
        } else {
          logger.warn({ matchID: this.matchID }, 'deadline fired but no action available');
        }
        this.schedule();
        return;
      }
      logger.info(
        { matchID: this.matchID, seat: action.playerID, move: action.move },
        'deadline reached, acting on behalf',
      );
      const outcome = await this.step(
        { playerID: action.playerID, move: action.move, args: action.args },
        'timeout',
      );
      this.afterAutomatic(outcome, 'timeout');
    } catch (err) {
      logger.error(
        { matchID: this.matchID, stateID: this.state.stateID, err },
        'deadline move threw',
      );
      this.countAutoFailure('timeout', 'exception');
    }
  }

  /** 自动步被拒时累计次数；达到上限后停止排程 */
  private afterAutomatic(outcome: SubmitResult, kind: 'auto' | 'timeout'): void {
    if (outcome.ok || this.closed || this.over) return;
    if (outcome.code === 'internal_error') {
      // 房间还开着说明是存储写入失败：不计入失败上限，按退避继续重试
      if (this.storageUnhealthy) this.scheduleStorageRetry(kind);
      return;
    }
    this.countAutoFailure(kind, outcome.code);
  }

  /** 存储不可用时重新排一次同类自动步，间隔 1 秒起每次翻倍、上限 30 秒 */
  private scheduleStorageRetry(kind: 'auto' | 'timeout'): void {
    this.clearTimer();
    const delayMs = this.storageBackoffMs;
    this.storageBackoffMs = Math.min(this.storageBackoffMs * 2, STORAGE_BACKOFF_MAX_MS);
    const gen = this.generation;
    logger.warn({ matchID: this.matchID, kind, delayMs }, 'storage unavailable, retry scheduled');
    this.timer = this.deps.timers.setTimeout(() => {
      this.timer = null;
      void this.enqueue(() => (kind === 'auto' ? this.runAuto(gen) : this.runTimeout(gen)));
    }, delayMs);
  }

  private setStorageHealth(healthy: boolean): void {
    if (this.storageUnhealthy === !healthy) return;
    this.storageUnhealthy = !healthy;
    if (healthy) this.storageBackoffMs = STORAGE_BACKOFF_START_MS;
    logger.warn({ matchID: this.matchID, healthy }, 'storage health changed');
    try {
      this.deps.onStorageHealth?.(healthy);
    } catch (err) {
      logger.error({ matchID: this.matchID, err }, 'onStorageHealth failed');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.deps.timers.setTimeout(resolve, ms);
    });
  }

  /**
   * 写快照：抛错时按 100 ms、400 ms 快速重试。
   * 之前的尝试抛过错时，后面得到 'conflict' 可能只是「上次其实写成功了、应答丢了」，
   * 此时读一次库里的版本号，等于本步的新版本就当成功。
   */
  private async persistWithRetry(
    next: MatchState<SetupState>,
    expectedStateID: number,
  ): Promise<'ok' | 'conflict' | 'error'> {
    let threw = false;
    for (let attempt = 0; attempt <= PERSIST_RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await this.sleep(PERSIST_RETRY_DELAYS_MS[attempt - 1]!);
      try {
        const result = await this.deps.persist(next, expectedStateID);
        if (result === 'ok') return 'ok';
        if (!threw) return 'conflict';
        const stored = (await this.deps.loadStoredVersion?.()) ?? null;
        if (stored === next.stateID) return 'ok';
        if (stored !== null && stored !== expectedStateID) return 'conflict';
        // 库里仍是旧版本（或没读到）：写入没有生效，继续重试
        threw = true;
      } catch (err) {
        threw = true;
        logger.warn({ matchID: this.matchID, attempt: attempt + 1, err }, 'persist attempt failed');
      }
    }
    return 'error';
  }

  /** 记一次自动步失败（被拒或抛异常）；未到上限就重新排程，排程本身出错只记日志 */
  private countAutoFailure(kind: 'auto' | 'timeout', reason: string): void {
    if (this.closed || this.over) return;
    this.autoRejects += 1;
    if (this.autoRejects >= MAX_AUTO_FAILURES) {
      logger.error(
        { matchID: this.matchID, kind, reason },
        'automatic move rejected repeatedly, stop scheduling',
      );
      return;
    }
    logger.warn({ matchID: this.matchID, kind, reason }, 'automatic move rejected');
    try {
      this.schedule();
    } catch (err) {
      logger.error({ matchID: this.matchID, err }, 'schedule failed');
    }
  }

  /** 执行一步：运行器 → 快照 → 推进状态 → 排程 → 归档回调 */
  private async step(request: MoveRequest, source: StepOutput['source']): Promise<SubmitResult> {
    const before = this.state;
    const outcome = applyMove(this.deps.game, before, request);
    if (!outcome.ok) {
      logger.info(
        {
          matchID: this.matchID,
          seat: request.playerID,
          move: request.move,
          reason: outcome.reason,
        },
        'move rejected',
      );
      return { ok: false, code: outcome.reason };
    }

    const persisted = await this.persistWithRetry(outcome.state, before.stateID);
    if (persisted === 'error') {
      // 存储暂时不可用：这一步不生效，房间保持开着，等存储恢复
      logger.error(
        { matchID: this.matchID, stateID: before.stateID },
        'persist failed after retries, step not applied',
      );
      this.setStorageHealth(false);
      return { ok: false, code: 'internal_error' };
    }
    if (persisted === 'conflict') {
      logger.error(
        { matchID: this.matchID, stateID: before.stateID },
        'persist conflict, closing room',
      );
      this.fatal('persist_conflict');
      return { ok: false, code: 'internal_error' };
    }
    this.setStorageHealth(true);

    this.state = outcome.state;
    this.autoRejects = 0;
    this.timeoutMisses = 0;
    logger.info(
      {
        matchID: this.matchID,
        seat: request.playerID,
        move: request.move,
        stateID: outcome.state.stateID,
        source,
      },
      'move accepted',
    );

    const gameOver = outcome.state.ctx.gameover !== undefined;
    if (gameOver) {
      this.over = true;
      this.clearTimer();
    } else {
      try {
        this.schedule();
      } catch (err) {
        // 这一步已落盘，排程出错不能挡住归档与下发
        logger.error(
          { matchID: this.matchID, stateID: outcome.state.stateID, err },
          'schedule failed',
        );
      }
    }

    try {
      await this.deps.onStep({
        state: outcome.state,
        events: outcome.events,
        request,
        source,
        deadlineAt: this.deadline,
      });
    } catch (err) {
      logger.error({ matchID: this.matchID, err }, 'onStep failed');
    }

    if (gameOver) {
      logger.info({ matchID: this.matchID, stateID: outcome.state.stateID }, 'match over');
      try {
        await this.deps.onGameOver(outcome.state);
      } catch (err) {
        logger.error({ matchID: this.matchID, err }, 'onGameOver failed');
      }
    }

    return { ok: true, stateID: outcome.state.stateID };
  }
}
