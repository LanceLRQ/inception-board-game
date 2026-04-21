// 嫁接结算 Dialog · 选 2 张返牌库顶
// 对照：docs/manual/04-action-cards.md §嫁接

import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface GraftResolverDialogProps {
  open: boolean;
  hand: string[];
  /** 已挑选的卡牌顺序（第 1 张位于最顶） */
  picked: string[];
  cardNameOf?: (cardId: string) => string;
  onToggle: (cardId: string) => void;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function GraftResolverDialog({
  open,
  hand,
  picked,
  cardNameOf,
  onToggle,
  onConfirm,
  onCancel,
}: GraftResolverDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel?.();
      }}
      blocking
      size="md"
      data-testid="graft-resolver"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-emerald-500" aria-hidden />
            嫁接 · 选 2 张手牌放回牌库顶
          </span>
        </DialogTitle>
        <DialogDescription>第 1 张位于最顶；顺序由挑选顺序决定。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-wrap gap-2">
          {hand.map((card, idx) => {
            const pickedIdx = picked.indexOf(card);
            const isPicked = pickedIdx >= 0;
            return (
              <button
                key={`graft-pick-${idx}-${card}`}
                type="button"
                onClick={() => onToggle(card)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px]',
                  isPicked
                    ? 'border-emerald-400 bg-emerald-500/30 text-emerald-400'
                    : 'border-border bg-card hover:border-emerald-400/60',
                )}
                data-testid={`graft-card-${idx}`}
              >
                {isPicked && <span className="mr-1 text-[10px]">#{pickedIdx + 1}</span>}
                {cardNameOf?.(card) ?? card}
              </button>
            );
          })}
        </div>
      </DialogBody>
      <DialogFooter>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          >
            取消
          </button>
        )}
        <button
          type="button"
          disabled={picked.length !== 2}
          onClick={onConfirm}
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="graft-confirm"
        >
          确认放回
        </button>
      </DialogFooter>
    </Dialog>
  );
}
