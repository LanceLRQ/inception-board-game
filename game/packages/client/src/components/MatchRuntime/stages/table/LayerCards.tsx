// 牌桌中央的梦境层：一层到四层从左到右横排成卡片，迷失层是下方一条灰色长条
// 所有主题的中央舞台共用这套结构，配色与装饰由各主题的皮肤样式决定（ms-dreamcard）。

import { useTranslation } from 'react-i18next';
import { cn } from '../../../../lib/utils';
import { getCardImageUrl } from '../../../../lib/cardImages';
import { CardArt } from '../../../CardArt';
import type { BoardLayer } from '../../model/boardModel';
import { DreamLayerCard, OccupantChip } from './DreamLayerCard';

interface LayerCardsProps {
  readonly layers: readonly BoardLayer[];
  readonly focusLayer: number;
  readonly onFocus: (layer: number) => void;
  readonly onOpenCard: (cardId: string) => void;
  readonly className?: string;
}

/** 牌桌上从左到右的层序：一层在最左 */
export function tableLayerOrder(layers: readonly BoardLayer[]): {
  dreams: BoardLayer[];
  lost: BoardLayer | undefined;
} {
  return {
    dreams: layers.filter((l) => l.layer > 0).sort((a, b) => a.layer - b.layer),
    lost: layers.find((l) => l.layer === 0),
  };
}

function LostStrip({
  row,
  focus,
  onFocus,
}: {
  row: BoardLayer;
  focus: boolean;
  onFocus: (layer: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="layer-row-0"
      data-layer={0}
      data-lost
      data-focus={focus || undefined}
      data-viewer-layer={row.hasViewer || undefined}
      className="ms-dreamcard relative isolate flex shrink-0 items-center gap-2 overflow-hidden px-2 py-1"
    >
      <CardArt
        src={getCardImageUrl(row.dreamCardId)}
        className="ms-card aspect-[745/1040] h-8 shrink-0"
      />
      <button
        type="button"
        onClick={() => onFocus(0)}
        aria-pressed={focus}
        aria-label={t('desktop.board.focusLayer', { layer: 0, name: t('board.layerName.0') })}
        data-testid="layer-focus-0"
        className="flex shrink-0 items-baseline gap-1.5 after:absolute after:inset-0 after:content-['']"
      >
        <span className="font-mono text-[10px] tracking-[.14em]">L0</span>
        <span className="font-heading text-[12px] font-bold tracking-[.1em] whitespace-nowrap">
          {t('board.layerName.0')}
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {row.occupants.length === 0 ? (
          <span className="truncate font-mono text-[10px] tracking-[.06em] opacity-80">
            {t('board.tower.lostEmpty')}
          </span>
        ) : (
          row.occupants.map((o) => <OccupantChip key={o.id} occupant={o} named />)
        )}
      </div>
    </div>
  );
}

export function LayerCards({
  layers,
  focusLayer,
  onFocus,
  onOpenCard,
  className,
}: LayerCardsProps) {
  const { t } = useTranslation();
  const { dreams, lost } = tableLayerOrder(layers);
  return (
    <div
      className={cn('flex min-h-0 flex-col gap-1.5', className)}
      aria-label={t('board.tower.aria')}
      data-testid="layer-tower"
    >
      <div className="flex min-h-0 flex-1 gap-1.5">
        {dreams.map((row) => (
          <DreamLayerCard
            key={row.layer}
            row={row}
            focus={row.layer === focusLayer}
            onFocus={onFocus}
            onOpenCard={onOpenCard}
          />
        ))}
      </div>
      {lost && <LostStrip row={lost} focus={focusLayer === 0} onFocus={onFocus} />}
    </div>
  );
}
