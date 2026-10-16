// 本地人机对局会话
//
// 把「建局、真人 move、自动行动」的全部判断收在一个同步的类里，
// 不含 Comlink、定时器与 DOM，Worker 只负责调度与日志。
// 状态由引擎包的对局运行器驱动；Bot 的决策来自 @icgame/bot。

import { InceptionCityGame, viewMatch, type MatchView } from '@icgame/game-engine';
import type { EventBatch } from '../match/eventFeed.js';
import type { SetupState } from '@icgame/game-engine/setup';
import {
  applyMove,
  createMatch,
  eventsFor,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type MoveOutcome,
  type RejectReason,
  type RunnerCtx,
} from '@icgame/game-engine/runner';
import { nextAutoAction, type AutoAction } from '@icgame/bot';
import { LOCAL_HUMAN_SEAT } from './localSeat.js';

const game: GameDef<SetupState> = InceptionCityGame;

/** 同一个自动动作连续被拒达到这个次数后，不再继续调度 */
export const MAX_CONSECUTIVE_REJECTS = 3;

/**
 * 白羊·星尘由真人持有时，Bot 的回合最多先等她多久（毫秒）。
 * 星尘的选择不挡住回合主人（引擎没有「放弃」这个 move，回合结束时选择自动失效），
 * 不等的话 Bot 几百毫秒就走完回合，选择窗口一闪而过；到时仍未选择就让回合继续。
 */
export const ARIES_GRACE_MS = 20_000;

/**
 * 主线程可见的对局视图：真人座位看到的白名单视图加流程信息与版本号，
 * 不含随机种子、牌库顺序、他人手牌。
 */
export interface SessionView {
  G: MatchView;
  ctx: RunnerCtx;
  stateID: number;
}

export interface StepResult {
  /** 这一步做了什么；没有可自动执行的动作时为 null */
  action: AutoAction | null;
  ok: boolean;
  reason?: string;
  /** 是否还应当继续调度下一步 */
  continue: boolean;
  /** 没有动作是因为在等（真人白羊·星尘的选择，或 Bot 的节奏没到点）：需要稍后再来看一眼 */
  waiting?: boolean;
}

export interface LocalMatchSessionOptions {
  playerCount: number;
  seed: string;
  /** 真人玩家 ID，默认是本地真人座位 */
  humanPlayerID?: string;
  /** 当前时刻（毫秒）；测试用，默认 Date.now */
  now?: () => number;
  /**
   * Bot 座位是否在自己回合的出牌阶段按策略打行动牌，缺省是。
   * 只有端到端等需要安静 Bot 的场合关闭（地址参数 `botplay=off`）。
   */
  botPlaysCards?: boolean;
  /**
   * Bot 每一步与上一步（无论谁的）落地之间至少相隔多少毫秒，缺省 0（不限）。
   * 本地对局由 Worker 传入，让玩家看得清 Bot 在做什么；端到端用 `botpace=fast` 时为 0。
   */
  botStepMs?: number;
  /** 从存档恢复的状态；给了就沿用它，不再新建对局（playerCount 与 seed 此时不起作用） */
  restoredState?: MatchState<SetupState>;
}

/**
 * 校验并迁移存档里的引擎状态；不是合法快照时抛错。
 * 存档的引擎状态结构版本是否匹配由存档层先行检查，这里再经引擎自带的迁移与形状校验兜一道。
 */
export function restoreMatchState(raw: unknown): MatchState<SetupState> {
  return matchFromSnapshot<SetupState>(raw, game);
}

/** 把运行器的拒绝结果整理成一行说明 */
function describeReject(outcome: Extract<MoveOutcome<SetupState>, { ok: false }>): string {
  if (outcome.error instanceof Error) return `${outcome.reason}: ${outcome.error.message}`;
  if (outcome.error !== undefined) return `${outcome.reason}: ${String(outcome.error)}`;
  return outcome.reason;
}

/**
 * 对局随机种子：房间号加建局时刻。
 * 好友房页面传入的是固定的房间号，只用房间号做种子会让重开或刷新后的角色、
 * 金库位置、骰子序列完全重复，所以必须混入时间。
 */
export function buildMatchSeed(matchID: string | undefined, now: number): string {
  return `${matchID ?? 'local'}-${now}`;
}

/** 事件记录只留最近这么多步：界面每半秒取一次，落后太多的旧事件也不再播放 */
export const EVENT_LOG_LIMIT = 64;

export class LocalMatchSession {
  private state: MatchState<SetupState>;
  private readonly humanPlayerID: string;
  /** 最近一次被拒的自动动作及其连续被拒次数 */
  private rejectedKey: string | null = null;
  private rejectedCount = 0;
  private readonly now: () => number;
  private readonly botPlaysCards: boolean;
  private readonly botStepMs: number;
  /** 上一步 move 落地的时刻；建局也算一步 */
  private lastAppliedAt: number;
  /** 正在等真人白羊选择：哪一次选择、从什么时候开始等 */
  private ariesWait: { key: string; since: number } | null = null;
  /** 最近几步的事件，已按真人座位裁剪（别人的秘密不留在这里） */
  private eventLog: EventBatch[] = [];

  constructor(options: LocalMatchSessionOptions) {
    this.humanPlayerID = options.humanPlayerID ?? LOCAL_HUMAN_SEAT;
    this.now = options.now ?? Date.now;
    this.botPlaysCards = options.botPlaysCards ?? true;
    this.botStepMs = options.botStepMs ?? 0;
    this.lastAppliedAt = this.now();
    this.state =
      options.restoredState ??
      createMatch(game, {
        numPlayers: options.playerCount,
        setupData: { rngSeed: options.seed },
        seed: options.seed,
      });
  }

  /** 从存档里读出的原始状态恢复一局；状态不合法或没有真人座位时抛错 */
  static fromSnapshot(
    raw: unknown,
    options: Omit<LocalMatchSessionOptions, 'restoredState'>,
  ): LocalMatchSession {
    const restoredState = restoreMatchState(raw);
    const human = options.humanPlayerID ?? LOCAL_HUMAN_SEAT;
    if (!restoredState.ctx.playOrder.includes(human)) {
      throw new Error(`存档里没有真人座位 ${human}`);
    }
    return new LocalMatchSession({ ...options, restoredState });
  }

  /**
   * 完整状态的快照，含随机种子与牌库顺序：只能写进本机存档，绝不能交给界面线程。
   * 界面线程要的视图用 view()。
   */
  snapshot(): MatchState<SetupState> {
    return this.state;
  }

  /** 真人座位的视图；完整状态只留在会话内部，供 Bot 决策与 move 使用 */
  view(): SessionView {
    const { G, ctx, stateID } = viewMatch(game, this.state, this.humanPlayerID);
    // 视图钩子产出的就是 MatchView（协议类型里 G 只是不透明的 unknown）
    return { G: G as MatchView, ctx, stateID };
  }

  /**
   * 真人发起的 move；被拒不抛异常，状态不变。
   * reason 是运行器给出的拒绝码，detail 是带异常信息的一行说明（供日志）。
   */
  humanMove(
    move: string,
    args: unknown[],
  ): { ok: boolean; reason?: RejectReason; detail?: string } {
    const outcome = applyMove(game, this.state, { playerID: this.humanPlayerID, move, args });
    if (!outcome.ok) {
      return { ok: false, reason: outcome.reason, detail: describeReject(outcome) };
    }
    this.accept(outcome);
    return { ok: true };
  }

  /** 真人白羊的选择还在宽限期内：Bot 的回合先不往下走 */
  private waitingForAries(): boolean {
    const { G } = this.state;
    const aries = G.pendingAriesChoice;
    if (aries === null || aries.ariesID !== this.humanPlayerID) {
      this.ariesWait = null;
      return false;
    }
    // 回合主人就是真人时，他操作的节奏本来就由真人掌握
    if (G.currentPlayerID === this.humanPlayerID) return false;
    const key = `${G.turnNumber}:${aries.victimID}:${aries.victimLayer}`;
    if (this.ariesWait?.key !== key) this.ariesWait = { key, since: this.now() };
    return this.now() - this.ariesWait.since < ARIES_GRACE_MS;
  }

  /** 执行一步自动行动 */
  step(): StepResult {
    if (this.waitingForAries()) return { action: null, ok: true, continue: true, waiting: true };
    const action = nextAutoAction(this.state, {
      humanPlayerIDs: [this.humanPlayerID],
      // 除真人座位外都是 Bot 座位
      policySeatIDs: this.botPlaysCards
        ? this.state.ctx.playOrder.filter((id) => id !== this.humanPlayerID)
        : [],
    });
    if (action === null) return { action: null, ok: true, continue: false };
    // 节奏：离上一步落地还不到一档，先等（动作留到下次再算，状态可能已被真人改变）
    if (this.now() - this.lastAppliedAt < this.botStepMs) {
      return { action: null, ok: true, continue: true, waiting: true };
    }

    const outcome = applyMove(game, this.state, {
      playerID: action.playerID,
      move: action.move,
      args: action.args,
    });
    if (outcome.ok) {
      this.accept(outcome);
      return { action, ok: true, continue: true };
    }

    const key = JSON.stringify([action.playerID, action.move, action.args]);
    this.rejectedCount = key === this.rejectedKey ? this.rejectedCount + 1 : 1;
    this.rejectedKey = key;
    return {
      action,
      ok: false,
      reason: describeReject(outcome),
      continue: this.rejectedCount < MAX_CONSECUTIVE_REJECTS,
    };
  }

  /** stateID 之后各步的事件（按真人座位裁剪），旧的在前 */
  eventsSince(stateID: number): EventBatch[] {
    return this.eventLog.filter((b) => b.stateID > stateID);
  }

  /** move 落地：换上新状态，记下这一步的事件 */
  private accept(outcome: Extract<MoveOutcome<SetupState>, { ok: true }>): void {
    this.state = outcome.state;
    this.lastAppliedAt = this.now();
    this.clearRejects();
    const events = eventsFor(outcome.events, this.humanPlayerID);
    if (events.length === 0) return;
    this.eventLog.push({ stateID: outcome.state.stateID, events });
    if (this.eventLog.length > EVENT_LOG_LIMIT) this.eventLog.shift();
  }

  private clearRejects(): void {
    this.rejectedKey = null;
    this.rejectedCount = 0;
  }
}
