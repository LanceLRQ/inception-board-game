// 解封响应窗口的状态与倒计时：弹窗与移动布局的响应条共用，保证两处行为一致
//
// 窗口数据来自 computeUnlockResponseState；本地来源到点自动放弃（startAutoPass），
// 联机时由服务端代发，这里只按服务端给出的截止时间显示剩余秒数。

import { useEffect, useState } from 'react';
import type { MatchView } from '@icgame/game-engine';
import { computeUnlockResponseState, type UnlockResponseBannerState } from './logic';
import { remainingSeconds, useSecondClock } from '../MatchRuntime/deadline';
import { startAutoPass } from './autoPass';

export interface UseUnlockResponseOptions {
  G: MatchView | null | undefined;
  viewerPlayerID: string;
  makeMove: (move: string, args: unknown[], opts?: { silent?: boolean }) => Promise<unknown> | void;
  /** 到点自动放弃；联机时由服务端代发，传 false。缺省 true */
  autoPass?: boolean;
  /** 服务端给出的截止时间（毫秒时间戳）；autoPass 为 false 时用它显示倒计时 */
  deadlineAt?: number | null;
}

export interface UnlockResponseModel {
  readonly state: UnlockResponseBannerState;
  /** 剩余秒数；没有截止信息为 null */
  readonly remainingSec: number | null;
  /** 剩余比例 0..1（进度条用）；没有截止信息或总时长未知为 null */
  readonly fraction: number | null;
}

/** 剩余比例：剩余秒数相对窗口总时长，夹在 0..1；总时长或剩余未知返回 null */
export function countdownFraction(remainingSec: number | null, timeoutMs: number): number | null {
  if (remainingSec === null || timeoutMs <= 0) return null;
  return Math.min(1, Math.max(0, (remainingSec * 1000) / timeoutMs));
}

export function useUnlockResponse({
  G,
  viewerPlayerID,
  makeMove,
  autoPass = true,
  deadlineAt = null,
}: UseUnlockResponseOptions): UnlockResponseModel {
  const state = computeUnlockResponseState(G, viewerPlayerID);
  const { visible, unlockerID, layer, timeoutMs } = state;

  const windowKey = visible ? `${unlockerID ?? '?'}/${layer ?? '?'}` : null;
  const [countdown, setCountdown] = useState<{ key: string; startAt: number; now: number } | null>(
    null,
  );

  useEffect(() => {
    if (!visible || !windowKey || !autoPass) return;
    const startAt = Date.now();
    const tick = () => setCountdown({ key: windowKey, startAt, now: Date.now() });
    const id = setInterval(tick, 500);
    queueMicrotask(tick);
    return () => clearInterval(id);
  }, [visible, windowKey, autoPass]);

  useEffect(() => {
    const stop = startAutoPass({
      active: visible && windowKey !== null,
      autoPass,
      timeoutMs,
      makeMove,
    });
    return stop ?? undefined;
  }, [visible, windowKey, autoPass, timeoutMs, makeMove]);

  const serverClock = useSecondClock(!autoPass && visible);

  const elapsed = countdown && countdown.key === windowKey ? countdown.now - countdown.startAt : 0;
  const remainingMs = Math.max(0, timeoutMs - elapsed);
  const remainingSec = autoPass
    ? Math.ceil(remainingMs / 1000)
    : remainingSeconds(deadlineAt, serverClock);

  return { state, remainingSec, fraction: countdownFraction(remainingSec, timeoutMs) };
}
