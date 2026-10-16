// 弃牌堆的整堆列表：弃牌堆本来就公开，最近弃掉的排在最前；点某张牌关掉列表并打开它的详情

import { useTranslation } from 'react-i18next';
import { Dialog, DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { getCardImageUrl } from '../../../lib/cardImages';
import { getCardName } from '../../../lib/cards';
import { CardArt } from '../../CardArt';

interface DiscardPileDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** 堆底在前、堆顶在最后 */
  readonly cards: readonly string[];
  readonly onOpenCard: (cardId: string) => void;
}

export function DiscardPileDialog({
  open,
  onOpenChange,
  cards,
  onOpenCard,
}: DiscardPileDialogProps) {
  const { t } = useTranslation();
  const newestFirst = [...cards].reverse();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      blocking={false}
      size="lg"
      data-testid="discard-pile-dialog"
    >
      <DialogHeader>
        <DialogTitle>{t('board.piles.discardTitle')}</DialogTitle>
        <DialogDescription>{t('board.piles.discardHint', { n: cards.length })}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
          {newestFirst.map((id, i) => {
            const name = getCardName(id);
            return (
              <li key={`${id}-${i}`}>
                <button
                  type="button"
                  className="ms-card relative block aspect-[745/1040] w-full overflow-hidden"
                  aria-label={name}
                  title={name}
                  onClick={() => {
                    onOpenChange(false);
                    onOpenCard(id);
                  }}
                >
                  <CardArt src={getCardImageUrl(id)} className="size-full" />
                </button>
              </li>
            );
          })}
        </ul>
      </DialogBody>
    </Dialog>
  );
}
