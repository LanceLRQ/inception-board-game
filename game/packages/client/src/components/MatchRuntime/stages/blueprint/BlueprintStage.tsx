// 「筑梦蓝图」的中央舞台：梦境剖面图
// 图头 + 陀螺回合行 + 自上而下 L4 → L1 的轴测楼板（焦点层加高）+ 迷失层虚线基础 + 底部图签（焦点层 / 回合 / 牌库刻度）。
// 左侧一条虚线箭头贯穿各层，示意自上而下穿层。吃与主题无关的盘面数据；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { BlueprintPlane } from './BlueprintPlane';
import { deckPercent } from './drafting';

export function BlueprintStage({ board, onFocusLayer, onOpenCard }: CenterStageProps) {
  const { t } = useTranslation();
  const banner = useBannerText(board.banner);
  const { deck, activity } = board;
  const percent = deckPercent(deck.remaining, deck.total);
  const focusRow = board.layers.find((r) => r.layer === board.focusLayer);

  return (
    <div
      className="blueprint-stage flex h-full min-h-0 flex-col gap-1.5"
      data-testid="blueprint-stage"
    >
      <div className="blueprint-head flex shrink-0 items-baseline justify-between pb-1.5">
        <h2 className="font-heading text-[15px] font-bold tracking-[.22em]">
          {t('desktop.board.blueprint.title')}
        </h2>
        <span className="font-mono text-[10px] tracking-[.14em] whitespace-nowrap text-faint">
          {t('desktop.board.blueprint.section', { n: board.turn.number })}
        </span>
      </div>
      <p className="blueprint-turn flex shrink-0 items-center gap-3 px-3 py-1.5">
        <i className="blueprint-totem shrink-0" aria-hidden />
        <span className="min-w-0 truncate font-mono text-[11px] tracking-[.16em]">{banner}</span>
      </p>
      <div className="relative flex min-h-0 flex-1 flex-col pl-4">
        <i className="blueprint-kick" aria-hidden />
        <ChevronDown
          className="blueprint-kick-head absolute bottom-0 left-[-1px] size-3"
          aria-hidden
        />
        <div
          className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={t('board.tower.aria')}
          data-testid="layer-tower"
        >
          {board.layers.map((row) => (
            <BlueprintPlane
              key={row.layer}
              row={row}
              focus={row.layer === board.focusLayer}
              onFocus={onFocusLayer}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
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
      <dl
        className="blueprint-sheet grid shrink-0 grid-cols-[auto_auto_1fr]"
        data-testid="deck-meter"
      >
        <div className="blueprint-sheet-cell">
          <dt>{t('desktop.board.blueprint.sheetFocus')}</dt>
          <dd className="tabular-nums">
            {t('desktop.board.blueprint.focusValue', {
              layer: board.focusLayer,
              n: focusRow?.heartLock ?? 0,
            })}
          </dd>
        </div>
        <div className="blueprint-sheet-cell">
          <dt>{t('desktop.board.blueprint.sheetRound')}</dt>
          <dd className="tabular-nums">{String(board.turn.number).padStart(2, '0')}</dd>
        </div>
        <div className="blueprint-sheet-cell">
          <dt>{t('desktop.board.blueprint.sheetDeck')}</dt>
          <dd className="flex items-center gap-2">
            <span className="tabular-nums whitespace-nowrap">
              {t('desktop.board.blueprint.deckValue', {
                remaining: deck.remaining,
                total: deck.total,
              })}
            </span>
            <span
              role="progressbar"
              aria-label={t('desktop.board.deckAria')}
              aria-valuemin={0}
              aria-valuemax={deck.total}
              aria-valuenow={deck.remaining}
              className="blueprint-ruler relative h-2 min-w-0 flex-1"
            >
              <i className="absolute inset-y-0 left-0 bg-acc" style={{ width: `${percent}%` }} />
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
