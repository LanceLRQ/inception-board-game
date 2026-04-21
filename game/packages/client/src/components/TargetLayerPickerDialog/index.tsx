// TargetLayerPickerDialog · 选目标层对话框
// 对照：plans/2-1-3-1-2-ui-cozy-wave.md 阶段 2

import { Layers } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { computeLayerOptions } from './logic';

export interface TargetLayerPickerDialogProps {
  pending: {
    card: string;
    move: string;
  } | null;
  /** viewer 当前层 — 穿梭剂类卡据此推导相邻层 */
  viewerLayer: number;
  cardNameOf?: (cardId: string) => string;
  /** 可选：显式合法层（覆盖默认推导） */
  validLayers?: number[] | null;
  onPick: (layer: number) => void;
  onCancel: () => void;
}

export function TargetLayerPickerDialog({
  pending,
  viewerLayer,
  cardNameOf,
  validLayers,
  onPick,
  onCancel,
}: TargetLayerPickerDialogProps) {
  const open = pending != null;
  const cardName = pending?.card ? (cardNameOf?.(pending.card) ?? pending.card) : '';
  const options = computeLayerOptions({
    cardId: pending?.card,
    viewerLayer,
    validLayers,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      blocking={false}
      size="sm"
      data-testid="target-layer-picker-dialog"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" aria-hidden />
            {cardName ? `${cardName} · 选择目标层` : '选择目标层'}
          </span>
        </DialogTitle>
        <DialogDescription>不合法的层已置灰。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-wrap items-center justify-center gap-3 py-2">
          {options.map((opt) => (
            <button
              key={opt.layer}
              type="button"
              disabled={opt.disabled}
              onClick={() => {
                if (opt.disabled) return;
                onPick(opt.layer);
              }}
              data-testid={`target-layer-${opt.layer}`}
              className="min-w-[64px] rounded-md border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              L{opt.layer}
            </button>
          ))}
        </div>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          data-testid="target-layer-cancel"
        >
          取消
        </button>
      </DialogFooter>
    </Dialog>
  );
}
