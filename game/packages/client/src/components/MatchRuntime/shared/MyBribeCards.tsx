import { useState } from 'react';
import type { MatchView } from '@icgame/game-engine';
import { BribeCardGallery } from '../../BribeCardGallery';
import { Dialog, DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';

/** 持牌人可随时回看；入口只显示公开张数，牌面必须主动打开才显示。 */
export function MyBribeCards({
  view,
  viewerSeat,
}: {
  view: Pick<MatchView, 'bribePool'> | null | undefined;
  viewerSeat: string;
}) {
  const [open, setOpen] = useState(false);
  const bribes = (view?.bribePool ?? []).filter(
    (bribe) => bribe.status === 'dispatched' && bribe.heldBy === viewerSeat,
  );
  if (bribes.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="min-h-11 shrink-0 rounded-md px-2 text-xs text-dim hover:bg-panel-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        data-testid="my-bribe-cards"
        onClick={() => setOpen(true)}
      >
        贿赂牌（{bribes.length}）
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        blocking={false}
        data-testid="my-bribe-cards-dialog"
      >
        <DialogHeader>
          <DialogTitle>我的贿赂牌（{bribes.length}）</DialogTitle>
          <DialogDescription>仅你可见。</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <BribeCardGallery bribes={bribes} />
        </DialogBody>
      </Dialog>
    </>
  );
}
