// 解封响应 banner
// 对照：docs/manual/04-action-cards.md §解封 效果②
// 当有玩家（含 bot）打出【解封】效果①时，本 banner 在响应者（非解封者）
//   视角显示，允许其用【解封】效果②抵消或跳过。
//
// 严格按规则：
//   - 任何玩家（含梦主）都可以使用效果②抵消 → 持牌校验放到 canCancel
//   - 效果②不能被再次抵消 → 由 engine 自动关闭窗口保证，UI 侧无需检查
//
// W19-B F11（client 侧兜底）：banner 显示后启动本地倒计时，到期自动 dispatch passResponse
//   避免人类 responder 挂机造成窗口永久阻塞。联机模式下服务端也会通过
//   WindowTimerManager 兜底（见 @icgame/server WindowTimerManager）。

import { useEffect, useState } from 'react';
import { KeyRound, AlertTriangle, Clock } from 'lucide-react';
import { computeUnlockResponseState } from './logic.js';
import type { SetupState } from '@icgame/game-engine';

export interface UnlockResponseBannerProps {
  G: SetupState | null | undefined;
  viewerPlayerID: string;
  /** G.players 中 id→nickname 查表（可选，用于更人类的描述） */
  nicknameOf?: (playerID: string) => string;
  /** 统一 makeMove 适配 */
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

export function UnlockResponseBanner({
  G,
  viewerPlayerID,
  nicknameOf,
  makeMove,
}: UnlockResponseBannerProps) {
  const { visible, unlockerID, layer, canCancel, remainingResponders, timeoutMs } =
    computeUnlockResponseState(G, viewerPlayerID);

  // F11 · banner 可见起倒计时；windowKey 唯一锚点：unlockerID + layer
  //   windowKey 变化时重置起始时间，避免上一次剩余时间影响下一轮。
  const windowKey = visible ? `${unlockerID ?? '?'}/${layer ?? '?'}` : null;
  // countdown.{key,startAt,now} 全部由 interval 回调驱动（不在 effect body 里 setState）
  const [countdown, setCountdown] = useState<{ key: string; startAt: number; now: number } | null>(
    null,
  );

  useEffect(() => {
    if (!visible || !windowKey) return;
    const startAt = Date.now();
    const tick = () => setCountdown({ key: windowKey, startAt, now: Date.now() });
    const id = setInterval(tick, 500);
    // 首 tick 通过 microtask 异步化，避开 react-hooks/set-state-in-effect 检查
    queueMicrotask(tick);
    return () => clearInterval(id);
  }, [visible, windowKey]);

  // 到期自动 pass（一次性 setTimeout 单独 effect，不 setState 不依赖 tick）
  useEffect(() => {
    if (!visible || !windowKey || timeoutMs <= 0) return;
    const id = setTimeout(() => {
      void makeMove('passResponse', [viewerPlayerID]);
    }, timeoutMs);
    return () => clearTimeout(id);
  }, [visible, windowKey, timeoutMs, makeMove, viewerPlayerID]);

  if (!visible) return null;

  const elapsed = countdown && countdown.key === windowKey ? countdown.now - countdown.startAt : 0;
  const remainingMs = Math.max(0, timeoutMs - elapsed);
  const remainingSec = Math.ceil(remainingMs / 1000);

  const unlockerName = unlockerID ? (nicknameOf?.(unlockerID) ?? unlockerID) : '玩家';

  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-sky-500/50 bg-sky-500/10 p-3 text-sm shadow-sm"
    >
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-sky-900 dark:text-sky-200">
              {unlockerName} 正在解封第 {layer ?? '?'} 层 — 是否使用【解封】抵消？
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
              <Clock className="h-3 w-3" />
              {remainingSec}s
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            剩余 {remainingResponders} 位玩家等待响应；全员跳过或超时则解封生效。
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canCancel}
              onClick={() => void makeMove('respondCancelUnlock', [viewerPlayerID])}
              className="rounded border border-sky-500 bg-sky-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            >
              使用【解封】抵消
            </button>
            <button
              type="button"
              onClick={() => void makeMove('passResponse', [viewerPlayerID])}
              className="rounded border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent"
            >
              跳过
            </button>
            {!canCancel && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                手中无【解封】，无法抵消
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
