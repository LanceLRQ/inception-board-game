// 本地人机对局会话
//
// 把「建局、真人 move、自动行动」的全部判断收在一个同步的类里，
// 不含 Comlink、定时器与 DOM，Worker 只负责调度与日志。
// 状态由引擎包的对局运行器驱动；Bot 的决策来自 @icgame/bot。

import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import {
  applyMove,
  createMatch,
  type GameDef,
  type MatchState,
  type MoveOutcome,
  type RunnerCtx,
} from '@icgame/game-engine/runner';
import { nextAutoAction, type AutoAction } from '@icgame/bot';

const game: GameDef<SetupState> = InceptionCityGame;

/** 同一个自动动作连续被拒达到这个次数后，不再继续调度 */
export const MAX_CONSECUTIVE_REJECTS = 3;

/** 主线程可见的对局视图：只有对局状态和流程信息，不含随机数状态 */
export interface SessionView {
  G: SetupState;
  ctx: RunnerCtx;
}

export interface StepResult {
  /** 这一步做了什么；没有可自动执行的动作时为 null */
  action: AutoAction | null;
  ok: boolean;
  reason?: string;
  /** 是否还应当继续调度下一步 */
  continue: boolean;
}

export interface LocalMatchSessionOptions {
  playerCount: number;
  seed: string;
  /** 真人玩家 ID，默认 '0' */
  humanPlayerID?: string;
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

export class LocalMatchSession {
  private state: MatchState<SetupState>;
  private readonly humanPlayerID: string;
  /** 最近一次被拒的自动动作及其连续被拒次数 */
  private rejectedKey: string | null = null;
  private rejectedCount = 0;

  constructor(options: LocalMatchSessionOptions) {
    this.humanPlayerID = options.humanPlayerID ?? '0';
    this.state = createMatch(game, {
      numPlayers: options.playerCount,
      setupData: { rngSeed: options.seed },
      seed: options.seed,
    });
  }

  view(): SessionView {
    return { G: this.state.G, ctx: this.state.ctx };
  }

  /** 真人发起的 move；被拒不抛异常，状态不变 */
  humanMove(move: string, args: unknown[]): { ok: boolean; reason?: string } {
    const outcome = applyMove(game, this.state, { playerID: this.humanPlayerID, move, args });
    if (!outcome.ok) return { ok: false, reason: describeReject(outcome) };
    this.state = outcome.state;
    this.clearRejects();
    return { ok: true };
  }

  /** 执行一步自动行动 */
  step(): StepResult {
    const action = nextAutoAction(this.state, { humanPlayerIDs: [this.humanPlayerID] });
    if (action === null) return { action: null, ok: true, continue: false };

    const outcome = applyMove(game, this.state, {
      playerID: action.playerID,
      move: action.move,
      args: action.args,
    });
    if (outcome.ok) {
      this.state = outcome.state;
      this.clearRejects();
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

  private clearRejects(): void {
    this.rejectedKey = null;
    this.rejectedCount = 0;
  }
}
