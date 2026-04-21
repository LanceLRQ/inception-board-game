// 万有引力 · 多目标选择 Dialog
// 对照：docs/manual/04-action-cards.md §万有引力

import { Orbit } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface GravityTargetOption {
  id: string;
  name: string;
  isAlive: boolean;
}

export interface GravityTargetPickerDialogProps {
  open: boolean;
  viewerPlayerID: string;
  options: GravityTargetOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GravityTargetPickerDialog({
  open,
  viewerPlayerID,
  options,
  selected,
  onToggle,
  onConfirm,
  onCancel,
}: GravityTargetPickerDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      blocking={false}
      size="md"
      data-testid="gravity-targets-picker"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Orbit className="h-4 w-4 text-violet-500" aria-hidden />
            万有引力 · 选 1-2 名玩家
          </span>
        </DialogTitle>
        <DialogDescription>不含自己；仅可选存活玩家。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-wrap gap-2">
          {options
            .filter((o) => o.id !== viewerPlayerID && o.isAlive)
            .map((opt) => {
              const picked = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onToggle(opt.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[11px]',
                    picked
                      ? 'border-violet-400 bg-violet-500/30 text-violet-400'
                      : 'border-border bg-card hover:border-violet-400/60',
                  )}
                  data-testid={`grav-target-${opt.id}`}
                >
                  {opt.name}
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
          disabled={selected.length < 1 || selected.length > 2}
          onClick={onConfirm}
          className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="gravity-confirm"
        >
          确认打出
        </button>
      </DialogFooter>
    </Dialog>
  );
}
