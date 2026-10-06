// 「深眠影院」的中央舞台：梦境剖面
// 标题行 + 回合横幅 + 自上而下 L4 → L1 的层级行（焦点层展开）+ 迷失层 + 底部牌库进度条。
// 吃与主题无关的盘面数据；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { NoirLayerRow } from './NoirLayerRow';

export function NoirStage({ board, onFocusLayer, onOpenCard }: CenterStageProps) {
  const { t } = useTranslation();
  const banner = useBannerText(board.banner);
  const { deck, activity } = board;
  const percent = deck.total > 0 ? Math.round((deck.remaining / deck.total) * 100) : 0;

  return (
    <div className="noir-stage flex h-full min-h-0 flex-col gap-2" data-testid="noir-stage">
      <div className="noir-head flex shrink-0 items-baseline justify-between pb-1.5">
        <h2 className="font-heading text-[15px] font-bold tracking-[.22em]">
          {t('desktop.board.title')}
        </h2>
        <span className="font-mono text-[10.5px] tracking-[.18em] text-faint">
          {t('desktop.board.round', { n: board.turn.number })}
        </span>
      </div>
      <p className="noir-banner shrink-0 truncate px-3 py-1.5 text-center font-mono text-[11px] tracking-[.18em]">
        <ChevronRight className="mr-1 inline size-3 align-[-2px]" aria-hidden />
        {banner}
      </p>
      <div
        className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t('board.tower.aria')}
        data-testid="layer-tower"
      >
        {board.layers.map((row) => (
          <NoirLayerRow
            key={row.layer}
            row={row}
            focus={row.layer === board.focusLayer}
            onFocus={onFocusLayer}
            onOpenCard={onOpenCard}
          />
        ))}
      </div>
      {activity && (
        <p
          className="flex shrink-0 items-center gap-1.5 truncate font-mono text-[10px] tracking-[.05em] text-faint"
          data-testid="latest-activity"
          aria-label={t('board.activity.aria')}
        >
          <ChevronRight className="size-2.5 shrink-0 text-dim" aria-hidden />
          <span className="truncate">{t(`board.activity.${activity.kind}`, activity.params)}</span>
        </p>
      )}
      <div
        className="noir-deck flex shrink-0 items-center justify-between gap-3 pt-2 font-mono text-[10.5px] tracking-[.14em] text-dim"
        data-testid="deck-meter"
      >
        <span className="tabular-nums whitespace-nowrap">
          {t('desktop.board.deck', { remaining: deck.remaining, total: deck.total })}
        </span>
        <div
          role="progressbar"
          aria-label={t('desktop.board.deckAria')}
          aria-valuemin={0}
          aria-valuemax={deck.total}
          aria-valuenow={deck.remaining}
          className="noir-deckbar relative h-0.5 flex-1"
        >
          <i className="absolute inset-y-0 left-0 bg-acc" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
