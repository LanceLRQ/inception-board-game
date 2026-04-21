// 梦主梦魇决策 Dialog
// 对照：docs/manual/03-game-flow.md 第 94-102 行
// 复用 MasterNightmareDecisionBanner/logic.ts

import { AlertTriangle } from 'lucide-react';
import type { SetupState } from '@icgame/game-engine';
import { computeNightmareDecisionState } from '../MasterNightmareDecisionBanner/logic.js';
import { Dialog, DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

export interface MasterNightmareDecisionDialogProps {
  G: SetupState | null | undefined;
  currentPlayerID: string;
  dreamMasterID: string;
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

export function MasterNightmareDecisionDialog({
  G,
  currentPlayerID,
  dreamMasterID,
  makeMove,
}: MasterNightmareDecisionDialogProps) {
  const { visible, pendingLayers } = computeNightmareDecisionState(
    G,
    currentPlayerID,
    dreamMasterID,
  );

  return (
    <Dialog open={visible} blocking size="md" data-testid="master-nightmare-decision-dialog">
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
            梦魇决策
          </span>
        </DialogTitle>
        <DialogDescription>盗梦者已打开金币金库，请在以下层选择处理方式。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-2">
          {pendingLayers.map((layer) => (
            <div
              key={layer}
              className="flex flex-wrap items-center gap-2 rounded bg-background/60 px-2 py-1.5"
            >
              <span className="text-xs font-medium text-muted-foreground">第 {layer} 层：</span>
              <button
                type="button"
                onClick={() => void makeMove('masterRevealNightmare', [layer])}
                className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
              >
                翻开梦魇
              </button>
              <button
                type="button"
                onClick={() => void makeMove('masterDiscardHiddenNightmare', [layer])}
                className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
              >
                弃掉（不发动）
              </button>
              <span className="text-[11px] text-muted-foreground">
                （派发贿赂请从贿赂响应窗口操作）
              </span>
            </div>
          ))}
        </div>
      </DialogBody>
    </Dialog>
  );
}
