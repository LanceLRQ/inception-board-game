// 黑天鹅·纷飞：抽牌阶段把全部手牌分给其他存活的盗梦者，然后抽 4 张。
// 先选一位接收者，再点手牌把它分给这位；已分给当前接收者的牌再点一次取消。全部分完才能确认。
// 草稿（每张牌分给了谁）在控制层，这里只负责展示与收集点按。
// 对照：docs/manual/05-dream-thieves.md 黑天鹅（266-272 行）

import { useTranslation } from 'react-i18next';
import { Check, Send } from 'lucide-react';
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

export interface BlackSwanTourDialogProps {
  readonly open: boolean;
  readonly hand: readonly string[];
  readonly recipients: readonly { readonly id: string; readonly name: string }[];
  /** 当前选中的接收者 */
  readonly active: string | null;
  /** 每张手牌分给了谁（按手牌位置），未分配为 null */
  readonly assigned: readonly (string | null)[];
  readonly progress: { readonly done: number; readonly total: number };
  readonly canConfirm: boolean;
  readonly onPickRecipient: (id: string) => void;
  readonly onTapCard: (index: number) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function BlackSwanTourDialog({
  open,
  hand,
  recipients,
  active,
  assigned,
  progress,
  canConfirm,
  onPickRecipient,
  onTapCard,
  onConfirm,
  onCancel,
}: BlackSwanTourDialogProps) {
  const { t } = useTranslation();
  const nameOf = (id: string) => recipients.find((r) => r.id === id)?.name ?? id;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      blocking={false}
      size="md"
      data-testid="black-swan-tour-dialog"
    >
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Send className="h-4 w-4 text-acc-bright" aria-hidden />
            {t('tour.title')}
          </span>
        </DialogTitle>
        <DialogDescription>{t('tour.desc')}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {recipients.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">{t('tour.noRecipients')}</p>
        ) : (
          <div className="space-y-3">
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label={t('tour.recipient')}
              data-testid="tour-recipients"
            >
              <span className="text-[11px] text-muted-foreground">{t('tour.recipient')}</span>
              {recipients.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={active === r.id}
                  onClick={() => onPickRecipient(r.id)}
                  data-testid={`tour-recipient-${r.id}`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] hover:border-acc/60',
                    active === r.id
                      ? 'border-acc bg-acc/30 text-acc-bright'
                      : 'border-border bg-card',
                  )}
                >
                  {active === r.id && <Check className="size-3" aria-hidden />}
                  {r.name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" data-testid="tour-cards">
              {hand.map((card, i) => {
                const to = assigned[i] ?? null;
                const state =
                  to === null ? t('tour.unassigned') : t('tour.assignedTo', { name: nameOf(to) });
                return (
                  <button
                    key={`${card}-${i}`}
                    type="button"
                    onClick={() => onTapCard(i)}
                    aria-label={t('tour.cardAria', { name: getCardName(card), state })}
                    data-testid={`tour-card-${i}`}
                    data-assigned={to ?? ''}
                    className={cn(
                      'flex min-w-[88px] flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left text-[12px]',
                      to === null
                        ? 'border-border bg-card hover:border-acc/60'
                        : 'border-acc bg-acc/20 text-acc-bright',
                    )}
                  >
                    <span>{getCardName(card)}</span>
                    <span className="text-[11px] text-muted-foreground">{state}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground" data-testid="tour-progress">
              {t('tour.progress', progress)}
            </p>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={onCancel}
          data-testid="tour-cancel"
          className="ms-btn min-h-8 px-3 text-[12px]"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={onConfirm}
          data-testid="tour-confirm"
          className="ms-btn min-h-8 px-3 text-[12px]"
          data-variant="primary"
        >
          {t('tour.confirm')}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
