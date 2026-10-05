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
  /** 房间因写快照失败而自行关闭时调用一次；它抛错不影响关闭 */
  onFatal?(reason: 'persist_conflict' | 'persist_error'): void;
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

  /** intentId → 结果，按插入顺序先进先出 */
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

      const known = this.intents.get(input.intentId);
      if (known !== undefined) return known;

      if (input.stateID !== undefined && input.stateID !== this.state.stateID) {
        return { ok: false, code: 'stale_state' };
      }

      const request: MoveRequest = { playerID: seat, move: input.move, args: input.args };
      const outcome = await this.step(request, 'player');
      this.remember(input.intentId, outcome);
      return outcome;
    });
  }

  /** 接管状态或在线状态变了，重新排程 */
  reschedule(): void {
    if (!this.started || this.closed) return;
    this.autoRejects = 0;
    this.schedule();
  }

  current(): MatchState<SetupState> {
    return this.state;
  }

  deadlineAt(): number | null {
    return this.deadline;
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

  /** 因写快照失败而关闭：先关，再通知一次 */
  private fatal(reason: 'persist_conflict' | 'persist_error'): void {
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
    if (!result.ok && (result.code === 'stale_state' || result.code === 'match_over')) return;
    this.intents.set(intentId, result);
    if (this.intents.size > INTENT_CAPACITY) {
      const oldest = this.intents.keys().next().value;
      if (oldest !== undefined) this.intents.delete(oldest);
    }
  }

  /** 按当前状态挂一个计时器（自动行动的短延迟或截止） */
  private schedule(): void {
    this.clearTimer();
    if (this.closed || this.over) return;
    if (this.autoRejects >= MAX_AUTO_FAILURES) return;

    const plan = planNext(this.state, this.humanSeats(), this.deps.timing);
    if (plan.kind === 'none') return;
    if (plan.kind === 'deadline' && this.timeoutMisses >= MAX_AUTO_FAILURES) return;

    const gen = this.generation;
    const { timers } = this.deps;
    if (plan.kind === 'deadline') this.deadline = timers.now() + plan.delayMs;
    this.timer = timers.setTimeout(() => {
      this.timer = null;
      void this.enqueue(() => (plan.kind === 'auto' ? this.runAuto(gen) : this.runTimeout(gen)));
    }, plan.delayMs);
  }

  private async runAuto(gen: number): Promise<void> {
    if (gen !== this.generation || this.closed || this.over) return;
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
  }

  private async runTimeout(gen: number): Promise<void> {
    if (gen !== this.generation || this.closed || this.over) return;
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
  }

  /** 自动步被拒时累计次数；达到上限后停止排程 */
  private afterAutomatic(outcome: SubmitResult, kind: 'auto' | 'timeout'): void {
    if (outcome.ok || this.closed || this.over) return;
    if (outcome.code === 'internal_error') return;
    this.autoRejects += 1;
    if (this.autoRejects >= MAX_AUTO_FAILURES) {
      logger.error(
        { matchID: this.matchID, kind, reason: outcome.code },
        'automatic move rejected repeatedly, stop scheduling',
      );
      return;
    }
    logger.warn({ matchID: this.matchID, kind, reason: outcome.code }, 'automatic move rejected');
    this.schedule();
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

    let persisted: 'ok' | 'conflict';
    try {
      persisted = await this.deps.persist(outcome.state, before.stateID);
    } catch (err) {
      logger.error({ matchID: this.matchID, err }, 'persist failed, closing room');
      this.fatal('persist_error');
      return { ok: false, code: 'internal_error' };
    }
    if (persisted !== 'ok') {
      logger.error(
        { matchID: this.matchID, stateID: before.stateID },
        'persist conflict, closing room',
      );
      this.fatal('persist_conflict');
      return { ok: false, code: 'internal_error' };
    }

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
      this.schedule();
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
