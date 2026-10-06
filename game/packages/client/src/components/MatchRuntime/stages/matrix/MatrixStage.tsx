// 「梦境矩阵」的中央舞台：一块终端窗口里的进程表
// 窗口标题栏 + 回合横幅（带闪烁光标）+ 自上而下 L4 → L0 的进程表（层 / 金库 / 心锁 / 占位 / 状态，
// 焦点层高亮）+ 焦点层详情 + 最新动态 + 分格的牌库进度条。
// 吃与主题无关的盘面数据，只用其中已有的字段；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { MatrixDetail } from './MatrixDetail';
import { MatrixRow } from './MatrixRow';
import { DECK_SEGMENTS, deckSegments } from './matrixRows';

const COLUMN_KEYS = ['layer', 'vault', 'lock', 'nodes', 'state'] as const;

export function MatrixStage({ board, onFocusLayer, onOpenCard }: CenterStageProps) {
  const { t } = useTranslation();
  const banner = useBannerText(board.banner);
  const { deck, activity } = board;
  const lit = deckSegments(deck.remaining, deck.total);
  const focusRow = board.layers.find((l) => l.layer === board.focusLayer);

  return (
    <div
      className="matrix-stage flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="matrix-stage"
    >
      <header className="matrix-menubar flex shrink-0 items-center gap-3 px-3 py-1.5">
        <span className="flex shrink-0 gap-1.5" aria-hidden>
          <i className="matrix-dot" />
          <i className="matrix-dot" />
          <i className="matrix-dot" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-center font-mono text-[10px] font-normal tracking-[.2em]">
          {t('desktop.board.matrix.window')}
        </h2>
        <span className="shrink-0 font-mono text-[10px] tracking-[.14em] whitespace-nowrap">
          {t('desktop.board.round', { n: board.turn.number })}
        </span>
      </header>
      <p className="matrix-turn flex shrink-0 items-center gap-2.5 px-3 py-1.5">
        <i className="matrix-cursor" aria-hidden />
        <span className="min-w-0 truncate font-mono text-[11px] tracking-[.14em]">{banner}</span>
      </p>
      <div
        role="table"
        aria-label={t('desktop.board.matrix.tableAria')}
        className="matrix-table flex min-h-0 flex-1 flex-col"
      >
        <div role="row" className="matrix-colhead grid shrink-0 items-center">
          {COLUMN_KEYS.map((key) => (
            <span
              key={key}
              role="columnheader"
              className={key === 'state' ? 'justify-self-end' : undefined}
            >
              {t(`desktop.board.matrix.cols.${key}`)}
            </span>
          ))}
        </div>
        <div
          role="rowgroup"
          aria-label={t('board.tower.aria')}
          data-testid="layer-tower"
          className="flex min-h-0 flex-1 flex-col"
        >
          {board.layers.map((row) => (
            <MatrixRow
              key={row.layer}
              row={row}
              focus={row.layer === board.focusLayer}
              onFocus={onFocusLayer}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
      </div>
      {focusRow && <MatrixDetail row={focusRow} />}
      {activity && (
        <p
          className="matrix-activity flex shrink-0 items-center gap-1.5 truncate px-3 py-1 font-mono text-[10px] tracking-[.05em]"
          data-testid="latest-activity"
          aria-label={t('board.activity.aria')}
        >
          <ChevronRight className="size-2.5 shrink-0" aria-hidden />
          <span className="truncate">{t(`board.activity.${activity.kind}`, activity.params)}</span>
        </p>
      )}
      <div
        className="matrix-deck flex shrink-0 items-center gap-3 px-3 py-1.5 font-mono text-[10px] tracking-[.14em]"
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
          className="matrix-deckbar flex h-1.5 flex-1 gap-px"
        >
          {Array.from({ length: DECK_SEGMENTS }, (_, i) => (
            <i key={i} className="matrix-seg min-w-0 flex-1" data-on={i < lit || undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}
