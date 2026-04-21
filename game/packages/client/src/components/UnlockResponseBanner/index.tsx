// 解封响应 banner
// 对照：docs/manual/04-action-cards.md §解封 效果②
// 当有玩家（含 bot）打出【解封】效果①时，本 banner 在响应者（非解封者）
//   视角显示，允许其用【解封】效果②抵消或跳过。
//
// 严格按规则：
//   - 任何玩家（含梦主）都可以使用效果②抵消 → 持牌校验放到 canCancel
//   - 效果②不能被再次抵消 → 由 engine 自动关闭窗口保证，UI 侧无需检查

import { KeyRound, AlertTriangle } from 'lucide-react';
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
  const { visible, unlockerID, layer, canCancel, remainingResponders } = computeUnlockResponseState(
    G,
    viewerPlayerID,
  );
  if (!visible) return null;

  const unlockerName = unlockerID ? (nicknameOf?.(unlockerID) ?? unlockerID) : '玩家';

  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-sky-500/50 bg-sky-500/10 p-3 text-sm shadow-sm"
    >
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="font-medium text-sky-900 dark:text-sky-200">
            {unlockerName} 正在解封第 {layer ?? '?'} 层 — 是否使用【解封】抵消？
          </div>
          <div className="text-xs text-muted-foreground">
            剩余 {remainingResponders} 位玩家等待响应；全员跳过则解封生效。
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
