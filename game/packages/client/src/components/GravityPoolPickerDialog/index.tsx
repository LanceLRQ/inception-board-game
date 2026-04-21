// 万有引力 · 池挑选 Dialog
// 当人类玩家是 bonder 时显示；轮流挑选池中卡牌

import { Orbit } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface GravityPoolPickerDialogProps {
  open: boolean;
  pool: string[];
  /** 当前轮到的玩家 id（用于 header 文案） */
  currentPicker: string;
  /** 当前人类 viewer id（用于判断 "你" 字样） */
  viewerPlayerID: string;
  cardNameOf?: (cardId: string) => string;
  onPick: (cardId: string) => void;
  onCancel?: () => void;
}

export function GravityPoolPickerDialog({
  open,
  pool,
  currentPicker,
  viewerPlayerID,
  cardNameOf,
  onPick,
  onCancel,
}: GravityPoolPickerDialogProps) {
  const pickerLabel = currentPicker === viewerPlayerID ? '你' : `AI ${currentPicker}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel?.();
      }}
      blocking
      size="md"
      data-testid="gravity-pool-picker"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Orbit className="h-4 w-4 text-violet-500" aria-hidden />
            万有引力 · 轮流挑选 · {pickerLabel}
          </span>
        </DialogTitle>
        <DialogDescription>从池中选 1 张牌加入手牌。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-wrap gap-2">
          {pool.map((c, idx) => (
            <button
              key={`grav-pool-${idx}-${c}`}
              type="button"
              onClick={() => onPick(c)}
              className="rounded-full border border-violet-400/60 bg-card px-2.5 py-0.5 text-[11px] hover:bg-violet-500/10"
              data-testid={`grav-pool-${idx}`}
            >
              {cardNameOf?.(c) ?? c}
            </button>
          ))}
        </div>
      </DialogBody>
      {onCancel && (
        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          >
            关闭
          </button>
        </DialogFooter>
      )}
    </Dialog>
  );
}
