// SHOOT·梦境穿梭剂 mode 选择 Dialog
// 对照：docs/manual/04-action-cards.md §SHOOT·梦境穿梭剂
// 规则：该牌同时视为【SHOOT】及【梦境穿梭剂】；使用时由使用者选择一种效果结算

import { Shuffle } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface DreamTransitModeDialogProps {
  open: boolean;
  onChoose: (mode: 'shoot' | 'transit') => void;
  onCancel: () => void;
}

export function DreamTransitModeDialog({ open, onChoose, onCancel }: DreamTransitModeDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      blocking={false}
      size="sm"
      data-testid="dream-transit-mode-picker"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Shuffle className="h-4 w-4 text-indigo-500" aria-hidden />
            SHOOT·梦境穿梭剂：选择结算方式
          </span>
        </DialogTitle>
        <DialogDescription>
          以 SHOOT 结算 → 掷骰打目标；以穿梭剂结算 → 自己相邻层移动。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-wrap items-center justify-center gap-3 py-2">
          <button
            type="button"
            onClick={() => onChoose('shoot')}
            className="min-w-[120px] rounded-md border border-indigo-500 bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
            data-testid="dream-mode-shoot"
          >
            以 SHOOT 结算
          </button>
          <button
            type="button"
            onClick={() => onChoose('transit')}
            className="min-w-[120px] rounded-md border border-indigo-400 bg-indigo-400 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            data-testid="dream-mode-transit"
          >
            以 穿梭剂 结算
          </button>
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
      </DialogFooter>
    </Dialog>
  );
}
