// 牌堆一行：抽牌堆（剩余张数）、弃牌堆（显示堆顶，点开看整堆）、本回合出牌区（点某张看详情）
// 桌面所有主题的中央舞台与移动层塔共用；数据都来自公开信息（牌库只有张数，弃牌堆与本回合出牌整堆公开）。
// 样式钩子类名：ms-pile（含 -card / -label）。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { getCardImageUrl } from '../../../lib/cardImages';
import { getCardName } from '../../../lib/cards';
import { CardArt } from '../../CardArt';
import type { BoardDeck, BoardPiles } from '../model/boardModel';
import { DiscardPileDialog } from './DiscardPileDialog';

interface PileRowProps {
  readonly deck: BoardDeck;
  readonly piles: BoardPiles;
  readonly onOpenCard: (cardId: string) => void;
  /** 小号（移动层塔）：牌更矮、不显示进度条 */
  readonly small?: boolean;
  readonly className?: string;
}

/** 本回合出牌区最多摆几张；更早的折叠成「+N」 */
export const PLAYED_VISIBLE = 5;

/** 本回合出牌区摆出来的牌（最近的几张）与折叠掉的张数 */
export function playedStrip(played: readonly string[]): {
  shown: readonly string[];
  folded: number;
} {
  const shown = played.slice(-PLAYED_VISIBLE);
  return { shown, folded: played.length - shown.length };
}

export function PileRow({ deck, piles, onOpenCard, small = false, className }: PileRowProps) {
  const { t } = useTranslation();
  const [discardOpen, setDiscardOpen] = useState(false);
  const top = piles.discard.at(-1) ?? null;
  const { shown, folded } = playedStrip(piles.played);
  const percent = deck.total > 0 ? Math.round((deck.remaining / deck.total) * 100) : 0;
  const cardCls = cn(
    'ms-pile-card relative block aspect-[745/1040] shrink-0 overflow-hidden',
    small ? 'h-9' : 'h-[clamp(36px,13cqh,56px)]',
  );

  return (
    <div className={cn('flex shrink-0 items-stretch gap-1.5', small && 'flex-wrap', className)}>
      <div
        className="ms-pile flex min-w-0 items-center gap-2 px-2 py-1"
        data-testid="deck-meter"
        role="group"
        aria-label={t('board.piles.drawAria', { n: deck.remaining })}
      >
        <span className={cardCls} aria-hidden>
          <CardArt src={getCardImageUrl('action_back')} className="size-full" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="ms-pile-label">{t('board.piles.draw')}</span>
          <span className="font-mono text-[12px] tabular-nums whitespace-nowrap">
            {deck.remaining} / {deck.total}
          </span>
          {!small && (
            <span
              role="progressbar"
              aria-label={t('desktop.board.deckAria')}
              aria-valuemin={0}
              aria-valuemax={deck.total}
              aria-valuenow={deck.remaining}
              className="ms-pile-bar relative h-0.5 w-full"
            >
              <i className="absolute inset-y-0 left-0 bg-acc" style={{ width: `${percent}%` }} />
            </span>
          )}
        </span>
      </div>

      <button
        type="button"
        className="ms-pile flex min-w-0 items-center gap-2 px-2 py-1 text-left disabled:cursor-default coarse:min-h-11"
        data-testid="pile-discard"
        disabled={top === null}
        onClick={() => setDiscardOpen(true)}
        aria-label={t('board.piles.discardOpen', { n: piles.discard.length })}
      >
        <span className={cn(cardCls, top === null && 'ms-pile-empty')} aria-hidden>
          {top !== null && <CardArt src={getCardImageUrl(top)} className="size-full" />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="ms-pile-label">{t('board.piles.discard')}</span>
          <span className="truncate text-[11px]">
            {top === null ? t('board.piles.empty') : getCardName(top)}
          </span>
          <span className="font-mono text-[10px] text-faint tabular-nums">
            {t('board.piles.count', { n: piles.discard.length })}
          </span>
        </span>
      </button>

      <div
        className={cn(
          'ms-pile flex min-w-0 flex-1 flex-col justify-center gap-1 px-2 py-1',
          small && 'min-w-32',
        )}
        data-testid="pile-played"
        role="group"
        aria-label={t('board.piles.played')}
      >
        <span className="ms-pile-label">{t('board.piles.played')}</span>
        {shown.length === 0 ? (
          <span className="truncate text-[11px] text-faint">{t('board.piles.playedEmpty')}</span>
        ) : (
          <span className="flex min-w-0 items-center">
            {folded > 0 && <span className="mr-1 font-mono text-[10px] text-faint">+{folded}</span>}
            {shown.map((id, i) =>
              small ? (
                // 小号放不下 44×44 的命中区：只展示，不单独点开
                <span
                  key={`${id}-${i}`}
                  className={cn(cardCls, i > 0 && '-ml-3', 'ms-card')}
                  title={getCardName(id)}
                >
                  <CardArt src={getCardImageUrl(id)} alt={getCardName(id)} className="size-full" />
                </span>
              ) : (
                <button
                  key={`${id}-${i}`}
                  type="button"
                  className={cn(cardCls, i > 0 && '-ml-3', 'ms-card')}
                  title={getCardName(id)}
                  aria-label={getCardName(id)}
                  onClick={() => onOpenCard(id)}
                >
                  <CardArt src={getCardImageUrl(id)} className="size-full" />
                </button>
              ),
            )}
          </span>
        )}
      </div>

      <DiscardPileDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        cards={piles.discard}
        onOpenCard={onOpenCard}
      />
    </div>
  );
}
