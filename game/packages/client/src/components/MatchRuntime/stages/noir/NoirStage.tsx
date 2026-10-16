// 「深眠影院」的中央舞台：标题行 + 回合横幅 + 牌桌（梦境层卡片与牌堆）+ 最新动态
// 吃与主题无关的盘面数据；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { TableBoard } from '../table/TableBoard';

export function NoirStage(props: CenterStageProps) {
  const { board } = props;
  const { t } = useTranslation();
  const banner = useBannerText(board.banner);
  const { activity } = board;

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
      <p
        className="noir-banner ms-turnbanner shrink-0 truncate px-3 py-1.5 text-center font-mono text-[11px] tracking-[.18em]"
        data-mine={board.banner.mine || undefined}
        data-testid="turn-banner"
      >
        <ChevronRight className="mr-1 inline size-3 align-[-2px]" aria-hidden />
        {banner}
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
