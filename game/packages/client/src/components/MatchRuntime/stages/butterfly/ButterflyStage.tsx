// 「庄周梦蝶」的中央舞台：一幅山水长卷
// 卷首题签（主题名 + 焦点层名，回合数）+ 一行回合横幅 + 自上而下的四重山（L4 最远最淡 → L1 最近最深，
// 各挂一枚竖排层签）+ 山外一只蝶（迷失层）+ 最新动态 + 牌库进度（一道墨线）。
// 吃与主题无关的盘面数据，只用其中已有的字段；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { ButterflyRow } from './ButterflyRow';
import { deckPercent } from './butterflyRows';

export function ButterflyStage({ board, onFocusLayer, onOpenCard }: CenterStageProps) {
  const { t, i18n } = useTranslation();
  const banner = useBannerText(board.banner);
  const { deck, activity } = board;
  const percent = deckPercent(deck.remaining, deck.total);

  return (
    <div
      // 竖排层签只在中文界面用：lang 决定样式里的 :lang(zh)
      lang={i18n.language}
      className="butterfly-stage flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="butterfly-stage"
    >
      <header className="butterfly-head flex shrink-0 items-end justify-between gap-3 px-4 pt-2.5 pb-2">
        <h2 className="butterfly-title min-w-0 truncate font-heading text-[17px] font-bold tracking-[.3em]">
          {t('theme.names.butterfly')}
          <em className="butterfly-title-dot mx-1.5 not-italic" aria-hidden>
            ·
          </em>
          <span className="butterfly-title-focus">{t(`board.layerName.${board.focusLayer}`)}</span>
        </h2>
        <span className="butterfly-dim shrink-0 font-mono text-[10px] tracking-[.18em] whitespace-nowrap">
          {t('desktop.board.round', { n: board.turn.number })}
        </span>
      </header>
      <p className="butterfly-turn flex shrink-0 items-center gap-2.5 px-4 py-1.5">
        <i className="butterfly-breath" aria-hidden />
        <span className="min-w-0 truncate font-heading text-[13px] tracking-[.1em]">{banner}</span>
      </p>
      <div
        role="group"
        aria-label={t('board.tower.aria')}
        data-testid="layer-tower"
        className="butterfly-range flex min-h-0 flex-1 flex-col"
      >
        {board.layers.map((row) => (
          <ButterflyRow
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
          className="butterfly-activity flex shrink-0 items-center gap-1.5 truncate px-4 py-1 text-[11px]"
          data-testid="latest-activity"
          aria-label={t('board.activity.aria')}
        >
          <ChevronRight className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{t(`board.activity.${activity.kind}`, activity.params)}</span>
        </p>
      )}
      <div
        className="butterfly-deck flex shrink-0 items-center gap-3 px-4 py-2 font-mono text-[10px] tracking-[.14em]"
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
          className="butterfly-deckbar relative h-1 flex-1"
        >
          <i
            className="butterfly-deckfill absolute inset-y-0 left-0"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
