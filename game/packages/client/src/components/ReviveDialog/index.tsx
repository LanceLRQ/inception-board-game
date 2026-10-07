// 复活弹层：复活自己（本人在迷失层）或复活同伴（本人存活，场上有人在迷失层）
// 对照：docs/manual/03-game-flow.md:65-67（出牌阶段弃 2 张手牌；复活自己到第 1 层，复活他人到自己所在层）、
//       docs/manual/06-dream-master.md:90 密道世界观（只能弃 1 张梦境穿梭剂）
// 选牌按手牌位置记录（同名牌各算一张）；不合格的牌（密道世界观下的非穿梭剂）置灰。

import { useTranslation } from 'react-i18next';
import { Check, HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCardName } from '../../lib/cards';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface ReviveDialogProps {
  open: boolean;
  mode: 'self' | 'other';
  targets: readonly { id: string; name: string }[];
  target: string | null;
  hand: readonly string[];
  picked: readonly number[];
  required: number;
  onlyTransit: boolean;
  /** 手牌里每张牌能不能付代价 */
  eligible: readonly boolean[];
  canConfirm: boolean;
  onPickTarget: (id: string) => void;
  onToggleCard: (index: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ReviveDialog({
  open,
  mode,
  targets,
  target,
  hand,
  picked,
  required,
  onlyTransit,
  eligible,
  canConfirm,
  onPickTarget,
  onToggleCard,
  onConfirm,
  onCancel,
}: ReviveDialogProps) {
  const { t } = useTranslation();
  const costKey = onlyTransit ? 'revive.dialog.costTransit' : 'revive.dialog.cost';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      blocking={false}
      size="md"
      data-testid="revive-dialog"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-ok" aria-hidden />
            {mode === 'self' ? t('revive.dialog.titleSelf') : t('revive.dialog.titleOther')}
          </span>
        </DialogTitle>
        <DialogDescription>
          {mode === 'self' ? t('revive.dialog.descSelf') : t('revive.dialog.descOther')}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {mode === 'other' && (
          <div className="mb-3" data-testid="revive-targets">
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              {t('revive.dialog.pickTarget')}
            </p>
            <div className="flex flex-wrap gap-2">
              {targets.map((tg) => (
                <button
                  key={tg.id}
                  type="button"
                  aria-pressed={target === tg.id}
                  onClick={() => onPickTarget(tg.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px]',
                    target === tg.id
                      ? 'border-ok bg-ok/30 text-ok'
                      : 'border-border bg-card hover:border-ok/60',
                  )}
                  data-testid={`revive-target-${tg.id}`}
                >
                  {target === tg.id && <Check className="size-3" aria-hidden />}
                  {tg.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="mb-1.5 text-[11px] text-muted-foreground" data-testid="revive-cost">
          {t(costKey, { n: required, picked: picked.length })}
        </p>
        <div className="flex flex-wrap gap-2" data-testid="revive-cards">
          {hand.map((card, idx) => {
            const isPicked = picked.includes(idx);
            const usable = eligible[idx] !== false;
            return (
              <button
                key={`revive-${idx}-${card}`}
                type="button"
                disabled={!usable}
                aria-pressed={isPicked}
                title={usable ? undefined : t('revive.dialog.notTransit')}
                onClick={() => onToggleCard(idx)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-40',
                  isPicked
                    ? 'border-ok bg-ok/30 text-ok'
                    : 'border-border bg-card hover:border-ok/60',
                )}
                data-testid={`revive-card-${idx}`}
              >
                {isPicked && <Check className="size-3" aria-hidden />}
                {getCardName(card)}
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
          data-testid="revive-cancel"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={onConfirm}
          className="rounded-md bg-ok px-3 py-1.5 text-xs font-medium text-background hover:bg-ok/90 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="revive-confirm"
        >
          {t('revive.dialog.confirm')}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
