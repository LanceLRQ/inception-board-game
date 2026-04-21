// 棋局·易位 Dialog（梦主专属）
// 对照：docs/manual/06-dream-master.md §棋局
// 选 2 个未开启的金库交换位置

import { ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface ChessVaultInfo {
  id: string;
  layer: number;
  isOpened: boolean;
}

export interface ChessTransposeDialogProps {
  open: boolean;
  vaults: ChessVaultInfo[];
  pickedIndices: number[];
  onToggle: (index: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ChessTransposeDialog({
  open,
  vaults,
  pickedIndices,
  onToggle,
  onConfirm,
  onCancel,
}: ChessTransposeDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      blocking={false}
      size="md"
      data-testid="chess-transpose-panel"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-amber-500" aria-hidden />
            棋局·易位 · 选择 2 个金库交换
          </span>
        </DialogTitle>
        <DialogDescription>已开启的金库不可选。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-wrap gap-2">
          {vaults.map((v, idx) => {
            const picked = pickedIndices.includes(idx);
            return (
              <button
                key={v.id}
                type="button"
                disabled={v.isOpened}
                onClick={() => onToggle(idx)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px]',
                  v.isOpened
                    ? 'border-muted bg-muted text-muted-foreground opacity-50'
                    : picked
                      ? 'border-amber-400 bg-amber-500/30 text-amber-400'
                      : 'border-border bg-card hover:border-amber-400/60',
                )}
                data-testid={`vault-${idx}`}
              >
                {v.isOpened ? '已开' : `金库 L${v.layer}`}
              </button>
            );
          })}
        </div>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
        >
          取消
        </button>
        <button
          type="button"
          disabled={pickedIndices.length !== 2}
          onClick={onConfirm}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="chess-confirm"
        >
          确认交换
        </button>
      </DialogFooter>
    </Dialog>
  );
}
