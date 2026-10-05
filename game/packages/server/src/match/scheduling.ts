// 对局房间的排程判定（纯函数）
//
// 只回答「上一步之后接下来该做什么、等多久」，不持有状态也不碰计时器。

import type { SetupState } from '@icgame/game-engine/setup';
import type { MatchState } from '@icgame/game-engine/runner';
import { listAwaiting } from '@icgame/game-engine';
import { nextAutoAction, type AutoAction } from '@icgame/bot';

export interface TimingConfig {
  /** 自动行动的短延迟 */
  botStepDelayMs: number;
  /** 有待结算事项（非响应窗口）时的截止时长 */
  pendingTimeoutMs: number;
  /** 回合主人正常行动的截止时长 */
  turnTimeoutMs: number;
  /** 响应窗口截止时长的上限，取它与窗口自带时长中较小的；不给就不设上限（测试用，缩短等待） */
  responseTimeoutCapMs?: number;
}

export const DEFAULT_TIMING: TimingConfig = {
  botStepDelayMs: 600,
  pendingTimeoutMs: 45_000,
  turnTimeoutMs: 120_000,
};

export type NextSchedule =
  | { kind: 'auto'; action: AutoAction; delayMs: number }
  | { kind: 'deadline'; delayMs: number }
  /** 对局已结束 */
  | { kind: 'none' };

/** 是否存在会挡住其他行动的待结算事项（响应窗口另算）；不挡人的待选择不改变回合主人的时限 */
function hasBlockingPending(G: SetupState): boolean {
  return listAwaiting(G).some((item) => item.blocking && item.field !== 'pendingResponseWindow');
}

/** 截止时长：响应窗口用窗口自己的，其次待结算事项，否则回合主人的正常行动 */
function deadlineMs(state: MatchState<SetupState>, timing: TimingConfig): number {
  const window = state.G.pendingResponseWindow;
  if (window) return Math.min(window.timeoutMs, timing.responseTimeoutCapMs ?? Infinity);
  if (hasBlockingPending(state.G)) return timing.pendingTimeoutMs;
  return timing.turnTimeoutMs;
}

export function planNext(
  state: MatchState<SetupState>,
  humanSeats: readonly string[],
  timing: TimingConfig,
): NextSchedule {
  if (state.ctx.gameover !== undefined) return { kind: 'none' };
  const action = nextAutoAction(state, { humanPlayerIDs: humanSeats });
  if (action !== null) return { kind: 'auto', action, delayMs: timing.botStepDelayMs };
  return { kind: 'deadline', delayMs: deadlineMs(state, timing) };
}

/** 截止时间到了：以所有座位都自动为前提取一步；取不到返回 null */
export function timeoutAction(state: MatchState<SetupState>): AutoAction | null {
  return nextAutoAction(state, { humanPlayerIDs: [] });
}
