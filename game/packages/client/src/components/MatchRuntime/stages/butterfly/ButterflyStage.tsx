// 「庄周梦蝶」的中央舞台：一幅长卷
// 卷首题签（主题名 + 焦点层名，回合数，一只蝶）+ 一行回合横幅 + 牌桌（梦境层卡片与牌堆）+ 最新动态。
// 吃与主题无关的盘面数据；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { TableBoard } from '../table/TableBoard';
import { ButterflyGlyph } from './ButterflyGlyph';

export function ButterflyStage(props: CenterStageProps) {
  const { board } = props;
  const { t } = useTranslation();
  const banner = useBannerText(board.banner);
  const { activity } = board;

  return (
    <div
      className="butterfly-stage flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="butterfly-stage"
    >
      <header className="butterfly-head flex shrink-0 items-end justify-between gap-3 px-4 pt-2.5 pb-2">
        <h2 className="butterfly-title flex min-w-0 items-end gap-2 truncate font-heading text-[17px] font-bold tracking-[.3em]">
          <ButterflyGlyph className="butterfly-flyer size-7 shrink-0" />
          <span className="truncate">
            {t('theme.names.butterfly')}
            <em className="butterfly-title-dot mx-1.5 not-italic" aria-hidden>
              ·
            </em>
            <span className="butterfly-title-focus">
              {t(`board.layerName.${board.focusLayer}`)}
            </span>
          </span>
        </h2>
        <span className="butterfly-dim shrink-0 font-mono text-[10px] tracking-[.18em] whitespace-nowrap">
          {t('desktop.board.round', { n: board.turn.number })}
        </span>
      </header>
      <p
        className="butterfly-turn ms-turnbanner flex shrink-0 items-center gap-2.5 px-4 py-1.5"
        data-mine={board.banner.mine || undefined}
        data-testid="turn-banner"
      >
        <i className="butterfly-breath" aria-hidden />
        <span className="min-w-0 truncate font-heading text-[13px] tracking-[.1em]">{banner}</span>
      </p>
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-1">
        <TableBoard {...props} />
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
    </div>
  );
}
