// 解封响应 Dialog（含本地倒计时）
// 对照：docs/manual/04-action-cards.md §解封 效果②
// 复用 UnlockResponseBanner/logic.ts

import { useEffect, useState } from 'react';
import { KeyRound, AlertTriangle, Clock } from 'lucide-react';
import type { SetupState } from '@icgame/game-engine';
import { computeUnlockResponseState } from '../UnlockResponseBanner/logic.js';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface UnlockResponseDialogProps {
  G: SetupState | null | undefined;
  viewerPlayerID: string;
  nicknameOf?: (playerID: string) => string;
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

export function UnlockResponseDialog({
  G,
  viewerPlayerID,
  nicknameOf,
  makeMove,
}: UnlockResponseDialogProps) {
  const { visible, unlockerID, layer, canCancel, remainingResponders, timeoutMs } =
    computeUnlockResponseState(G, viewerPlayerID);

  const windowKey = visible ? `${unlockerID ?? '?'}/${layer ?? '?'}` : null;
  const [countdown, setCountdown] = useState<{ key: string; startAt: number; now: number } | null>(
    null,
  );

  useEffect(() => {
    if (!visible || !windowKey) return;
    const startAt = Date.now();
    const tick = () => setCountdown({ key: windowKey, startAt, now: Date.now() });
    const id = setInterval(tick, 500);
    queueMicrotask(tick);
    return () => clearInterval(id);
  }, [visible, windowKey]);

  useEffect(() => {
    if (!visible || !windowKey || timeoutMs <= 0) return;
    const id = setTimeout(() => {
      void makeMove('passResponse', [viewerPlayerID]);
    }, timeoutMs);
    return () => clearTimeout(id);
  }, [visible, windowKey, timeoutMs, makeMove, viewerPlayerID]);

  const elapsed = countdown && countdown.key === windowKey ? countdown.now - countdown.startAt : 0;
  const remainingMs = Math.max(0, timeoutMs - elapsed);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const unlockerName = unlockerID ? (nicknameOf?.(unlockerID) ?? unlockerID) : '玩家';

  return (
    <Dialog open={visible} blocking size="md" data-testid="unlock-response-dialog">
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-sky-500" aria-hidden />
            {unlockerName} 解封第 {layer ?? '?'} 层 —— 是否使用【解封】抵消？
          </span>
        </DialogTitle>
        <DialogDescription>
          剩余 {remainingResponders} 位玩家等待响应；全员跳过或超时则解封生效。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex items-center gap-2 rounded bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
          <Clock className="h-3 w-3" />
          <span>倒计时 {remainingSec}s，到期自动跳过</span>
        </div>
        {!canCancel && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            手中无【解封】，无法抵消
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={() => void makeMove('passResponse', [viewerPlayerID])}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
        >
          跳过
        </button>
        <button
          type="button"
          disabled={!canCancel}
          onClick={() => void makeMove('respondCancelUnlock', [viewerPlayerID])}
          className="rounded-md border border-sky-500 bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
        >
          使用【解封】抵消
        </button>
      </DialogFooter>
    </Dialog>
  );
}
