import { useState } from 'react';
import { CardArt } from '../CardArt';
import { getCardImageUrl } from '../../lib/cardImages';
// TargetLayerPickerDialog · 选目标层对话框

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
  onPick: (layer: number) => void | Promise<void>;
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
  const intent = pending ? `${pending.card}:${pending.move}` : '';
  const [seen, setSeen] = useState(intent);
  const [picked, setPicked] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (seen !== intent) {
    setSeen(intent);
    setPicked(null);
    setConfirming(false);
  }
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
      size="md"
      className="tabletop-choice-dialog"
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
        <div className="tabletop-target-options">
          {options.map((opt) => (
            <button
              key={opt.layer}
              type="button"
              disabled={opt.disabled}
              onClick={() => {
                if (opt.disabled) return;
                setPicked(opt.layer);
              }}
              data-testid={`target-layer-${opt.layer}`}
              className="tabletop-target-option"
              aria-pressed={picked === opt.layer}
            >
              <CardArt src={getCardImageUrl(`dream_${opt.layer}`)} trimBorder={false} />
              <span>
                <strong>第 {opt.layer} 层</strong>
                <small>{opt.disabled ? '当前不可选' : '点击选择此层'}</small>
              </span>
            </button>
          ))}
        </div>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          className="tabletop-primary"
          data-testid="target-layer-confirm"
          disabled={
            confirming ||
            picked === null ||
            !options.some((opt) => opt.layer === picked && !opt.disabled)
          }
          onClick={() => {
            if (confirming || picked === null) return;
            setConfirming(true);
            void Promise.resolve(onPick(picked)).then(() => setConfirming(false));
          }}
        >
          {confirming ? '正在提交…' : '确认出牌'}
        </button>
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
