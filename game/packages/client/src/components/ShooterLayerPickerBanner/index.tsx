// SHOOT 发动方选层 banner（发动方端）
// 对照：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
// 触发：G.pendingShootMove 挂起 + viewer 是发动方 → 选相邻层按钮

import { Crosshair } from 'lucide-react';
import { computeShooterLayerPickerState } from './logic.js';
import type { SetupState } from '@icgame/game-engine';

export interface ShooterLayerPickerBannerProps {
  G: SetupState | null | undefined;
  viewerPlayerID: string;
  nicknameOf?: (playerID: string) => string;
  cardNameOf?: (cardId: string) => string;
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

export function ShooterLayerPickerBanner({
  G,
  viewerPlayerID,
  nicknameOf,
  cardNameOf,
  makeMove,
}: ShooterLayerPickerBannerProps) {
  const { visible, targetPlayerID, cardId, choices } = computeShooterLayerPickerState(
    G,
    viewerPlayerID,
  );
  if (!visible) return null;

  const targetName = targetPlayerID ? (nicknameOf?.(targetPlayerID) ?? targetPlayerID) : '目标';
  const cardName = cardId ? (cardNameOf?.(cardId) ?? cardId) : 'SHOOT';

  return (
    <div
      role="alert"
      data-testid="shooter-layer-picker"
      className="mt-3 rounded-lg border border-orange-500/50 bg-orange-500/10 p-3 text-sm shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="font-medium text-orange-900 dark:text-orange-200">
            {cardName} 命中 · 选择把 {targetName} 推去哪一相邻层
          </div>
          <div className="text-xs text-muted-foreground">
            规则：由发动方选择移动方向（不会进入迷失层）
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {choices.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => void makeMove('resolveShootMove', [l])}
                data-testid={`shooter-layer-pick-${l}`}
                className="rounded border border-orange-500 bg-orange-500 px-3 py-1 text-xs font-medium text-white hover:bg-orange-600"
              >
                L{l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
