// 梦主查看盗梦者贿赂牌 Dialog（ack-only · 梦境窥视效果②）
// 对照：docs/manual/04-action-cards.md §梦境窥视 效果②
// 复用 MasterBribeInspectBanner/logic.ts

import { Eye, Handshake, ShieldX, HelpCircle } from 'lucide-react';
import type { MatchView } from '@icgame/game-engine';
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

type BribeKind = 'deal' | 'fail' | null;

function bribeIcon(kind: BribeKind) {
  if (kind === 'deal') return <Handshake className="h-4 w-4 text-destructive" />;
  if (kind === 'fail') return <ShieldX className="h-4 w-4 text-faint" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

function bribeLabel(kind: BribeKind): string {
  if (kind === 'deal') return 'DEAL · 成交（该盗梦者已转阵营）';
  if (kind === 'fail') return '碎裂 · 未成交';
  return '未知';
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
        <div className="space-y-1.5">
          {bribes.length === 0 ? (
            <div className="text-xs text-muted-foreground">该盗梦者未持有贿赂牌。</div>
          ) : (
            bribes.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded bg-background/60 px-2 py-1.5"
              >
                {bribeIcon(b.kind)}
                <span className="text-xs">{bribeLabel(b.kind)}</span>
              </div>
            ))
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={() => void makeMove('peekerAcknowledge', [])}
          className="rounded-md border border-blood bg-blood px-3 py-1.5 text-xs font-medium text-foreground hover:bg-blood/90"
          data-testid="master-bribe-inspect-ack"
        >
          已确认
        </button>
      </DialogFooter>
    </Dialog>
  );
}
