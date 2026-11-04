// 梦主查看盗梦者贿赂牌 Dialog（ack-only · 梦境窥视效果②）
// 对照：docs/manual/04-action-cards.md §梦境窥视 效果②
// 复用 MasterBribeInspectBanner/logic.ts

import { Eye } from 'lucide-react';
import type { MatchView } from '@icgame/game-engine';
import { BribeCardGallery } from '../BribeCardGallery';
import { computeMasterBribeInspectState } from '../MasterBribeInspectBanner/logic.js';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface MasterBribeInspectDialogProps {
  G: MatchView | null | undefined;
  viewerPlayerID: string;
  makeMove: (move: string, args: unknown[]) => Promise<unknown> | void;
}

export function MasterBribeInspectDialog({
  G,
  viewerPlayerID,
  makeMove,
}: MasterBribeInspectDialogProps) {
  const { visible, targetThiefID, bribes } = computeMasterBribeInspectState(G, viewerPlayerID);

  return (
    <Dialog open={visible} blocking size="md" data-testid="master-bribe-inspect-dialog">
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Eye className="h-4 w-4 text-destructive" aria-hidden />
            查看盗梦者 {targetThiefID ?? '?'} 的全部贿赂牌
          </span>
        </DialogTitle>
        <DialogDescription>仅你可见。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {bribes.length === 0 ? (
          <div className="text-xs text-muted-foreground">该盗梦者未持有贿赂牌。</div>
        ) : (
          <BribeCardGallery bribes={bribes} />
        )}
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={() => void makeMove('peekerAcknowledge', [])}
          className="rounded-md border border-blood bg-blood px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-blood/90"
          data-testid="master-bribe-inspect-ack"
        >
          已确认
        </button>
      </DialogFooter>
    </Dialog>
  );
}
