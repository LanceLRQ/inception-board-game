// 「筑梦蓝图」的中央舞台：图头 + 陀螺回合行 + 牌桌（梦境层卡片与牌堆）+ 最新动态
// 吃与主题无关的盘面数据；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { TableBoard } from '../table/TableBoard';

export function BlueprintStage(props: CenterStageProps) {
  const { board } = props;
  const { t } = useTranslation();
  const banner = useBannerText(board.banner);
  const { activity } = board;

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
      <p
        className="blueprint-turn ms-turnbanner flex shrink-0 items-center gap-3 px-3 py-1.5"
        data-mine={board.banner.mine || undefined}
        data-testid="turn-banner"
      >
        <i className="blueprint-totem shrink-0" aria-hidden />
        <span className="min-w-0 truncate font-mono text-[11px] tracking-[.16em]">{banner}</span>
      </p>
      <TableBoard {...props} />
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
    </div>
  );
}
