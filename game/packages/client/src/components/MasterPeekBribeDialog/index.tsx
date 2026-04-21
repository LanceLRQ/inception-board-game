// 梦境窥视派贿赂决策 Dialog（梦主端）
// 对照：docs/manual/04-action-cards.md §梦境窥视 解析
// "梦主先决定是否让该盗梦者抽取 1 张贿赂牌，然后该盗梦者再查看任意一层梦境的金库"
//
// 复用 MasterPeekBribeBanner/logic.ts 的纯函数 computeMasterPeekBribeState。

import { Coins } from 'lucide-react';
import type { SetupState } from '@icgame/game-engine';
import { computeMasterPeekBribeState } from '../MasterPeekBribeBanner/logic.js';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface MasterPeekBribeDialogProps {
  G: SetupState | null | undefined;
  viewerPlayerID: string;
  nicknameOf?: (playerID: string) => string;
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

export function MasterPeekBribeDialog({
  G,
  viewerPlayerID,
  nicknameOf,
  makeMove,
}: MasterPeekBribeDialogProps) {
  const { visible, peekerID, layer, inPoolCount } = computeMasterPeekBribeState(G, viewerPlayerID);

  const peekerName = peekerID ? (nicknameOf?.(peekerID) ?? peekerID) : '盗梦者';

  return (
    <Dialog open={visible} blocking size="md" data-testid="master-peek-bribe-dialog">
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-500" aria-hidden />
            {peekerName} 窥视第 {layer ?? '?'} 层 —— 是否派发 1 张贿赂牌？
          </span>
        </DialogTitle>
        <DialogDescription>
          贿赂池还剩 {inPoolCount} 张可派；命中 DEAL 将使 {peekerName} 立即转为梦主阵营。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <p className="text-xs text-muted-foreground">
          规则：梦主决定是否让该盗梦者抽取 1 张贿赂牌，然后盗梦者查看所选层的金库。
        </p>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={() => void makeMove('masterPeekBribeDecision', [false])}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          data-testid="master-peek-bribe-skip"
        >
          跳过
        </button>
        <button
          type="button"
          onClick={() => void makeMove('masterPeekBribeDecision', [true])}
          className="rounded-md border border-amber-500 bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          data-testid="master-peek-bribe-deal"
        >
          派发贿赂
        </button>
      </DialogFooter>
    </Dialog>
  );
}
