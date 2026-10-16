// 「陀螺未停」的中央舞台：陀螺仪 + 牌桌
// 宽的时候左右并排：左是陀螺仪（陀螺 + 牌库表圈），右是回合横幅与牌桌（梦境层卡片与牌堆）；
// 窄的时候陀螺仪收成牌桌上方的一条。吃与主题无关的盘面数据；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { TableBoard } from '../table/TableBoard';
import { TotemGyro } from './TotemGyro';

export function TotemStage(props: CenterStageProps) {
  const { board } = props;
  const { t } = useTranslation();
  const banner = useBannerText(board.banner);
  const { deck, activity } = board;

  return (
    <div
      className="totem-stage flex h-full min-h-0 flex-col gap-2 @min-[620px]:flex-row @min-[620px]:gap-3"
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
        <p
          className="totem-turn ms-turnbanner flex shrink-0 items-center gap-1.5 px-3 py-1.5"
          data-mine={board.banner.mine || undefined}
          data-testid="turn-banner"
        >
          <ChevronRight className="size-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate font-mono text-[11px] tracking-[.14em]">{banner}</span>
        </p>
        <TableBoard {...props} />
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
