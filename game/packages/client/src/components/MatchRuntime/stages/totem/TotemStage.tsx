// 「陀螺未停」的中央舞台：陀螺仪 + 梦层塔
// 宽的时候左右并排：左是陀螺仪（陀螺 + 牌库表圈），右是梦层塔（回合横幅、自上而下 L4 → L0 的石板、
// 右缘一条穿层虚线）；窄的时候陀螺仪收成塔上方的一条。焦点层加高，迷失层带彭罗斯阶梯徽记。
// 吃与主题无关的盘面数据；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { TotemGyro } from './TotemGyro';
import { TotemSlab } from './TotemSlab';

export function TotemStage({ board, onFocusLayer, onOpenCard }: CenterStageProps) {
  const { t } = useTranslation();
  const banner = useBannerText(board.banner);
  const { deck, activity } = board;

  return (
    <div
      className="totem-stage flex h-full min-h-0 flex-col gap-2 @min-[520px]:flex-row @min-[520px]:gap-3"
      data-testid="totem-stage"
    >
      <TotemGyro deck={deck} />
      <section className="totem-tower flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
        <div className="totem-head flex shrink-0 items-baseline justify-between pb-1.5">
          <h2 className="font-heading text-[14px] font-bold tracking-[.24em] whitespace-nowrap">
            {t('desktop.board.totem.tower')}
            <em className="totem-head-focus ml-2 text-[10.5px] font-normal tracking-[.12em] not-italic">
              {t('desktop.board.totem.focus', { layer: board.focusLayer })}
            </em>
          </h2>
          <span className="font-mono text-[10px] tracking-[.14em] whitespace-nowrap text-faint">
            {t('desktop.board.round', { n: board.turn.number })}
          </span>
        </div>
        <p className="totem-turn flex shrink-0 items-center gap-1.5 px-3 py-1.5">
          <ChevronRight className="size-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate font-mono text-[11px] tracking-[.14em]">{banner}</span>
        </p>
        <div className="relative flex min-h-0 flex-1 flex-col pr-4">
          <i className="totem-kick" aria-hidden />
          <ChevronDown className="totem-kick-head absolute right-0 bottom-0 size-3" aria-hidden />
          <div
            className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t('board.tower.aria')}
            data-testid="layer-tower"
          >
            {board.layers.map((row) => (
              <TotemSlab
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
            className="totem-activity flex shrink-0 items-center gap-1.5 truncate font-mono text-[10px] tracking-[.05em] text-faint"
            data-testid="latest-activity"
            aria-label={t('board.activity.aria')}
          >
            <ChevronRight className="size-2.5 shrink-0 text-dim" aria-hidden />
            <span className="truncate">
              {t(`board.activity.${activity.kind}`, activity.params)}
            </span>
          </p>
        )}
      </section>
    </div>
  );
}
