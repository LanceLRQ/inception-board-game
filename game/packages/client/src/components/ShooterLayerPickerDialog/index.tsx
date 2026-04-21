// SHOOT 发动方选层 Dialog（发动方端）
// 对照：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
//
// 复用 ShooterLayerPickerBanner/logic.ts 的纯函数 computeShooterLayerPickerState。

import { Crosshair } from 'lucide-react';
import type { SetupState } from '@icgame/game-engine';
import { computeShooterLayerPickerState } from '../ShooterLayerPickerBanner/logic.js';
import { Dialog, DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

export interface ShooterLayerPickerDialogProps {
  G: SetupState | null | undefined;
  viewerPlayerID: string;
  nicknameOf?: (playerID: string) => string;
  cardNameOf?: (cardId: string) => string;
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

export function ShooterLayerPickerDialog({
  G,
  viewerPlayerID,
  nicknameOf,
  cardNameOf,
  makeMove,
}: ShooterLayerPickerDialogProps) {
  const { visible, targetPlayerID, cardId, choices } = computeShooterLayerPickerState(
    G,
    viewerPlayerID,
  );

  const targetName = targetPlayerID ? (nicknameOf?.(targetPlayerID) ?? targetPlayerID) : '目标';
  const cardName = cardId ? (cardNameOf?.(cardId) ?? cardId) : 'SHOOT';

  return (
    <Dialog open={visible} blocking size="md" data-testid="shooter-layer-picker">
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-orange-500" aria-hidden />
            {cardName} 命中 —— 把 {targetName} 推去哪一相邻层？
          </span>
        </DialogTitle>
        <DialogDescription>由发动方选择方向（目标不会进入迷失层）。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-wrap items-center justify-center gap-3 py-2">
          {choices.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => void makeMove('resolveShootMove', [l])}
              data-testid={`shooter-layer-pick-${l}`}
              className="min-w-[72px] rounded-md border border-orange-500 bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              L{l}
            </button>
          ))}
        </div>
      </DialogBody>
    </Dialog>
  );
}
