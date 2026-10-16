// 「梦境矩阵」的中央舞台：一块终端窗口
// 窗口标题栏 + 回合横幅（带闪烁光标）+ 牌桌（梦境层卡片与牌堆）+ 最新动态。
// 吃与主题无关的盘面数据；只展示，不处理出牌与选目标。

import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { CenterStageProps } from '../types';
import { useBannerText } from '../bannerText';
import { TableBoard } from '../table/TableBoard';

export function MatrixStage(props: CenterStageProps) {
  const { board } = props;
  const { t } = useTranslation();
  const banner = useBannerText(board.banner);
  const { activity } = board;

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
      <p
        className="matrix-turn ms-turnbanner flex shrink-0 items-center gap-2.5 px-3 py-1.5"
        data-mine={board.banner.mine || undefined}
        data-testid="turn-banner"
      >
        <i className="matrix-cursor" aria-hidden />
        <span className="min-w-0 truncate font-mono text-[11px] tracking-[.14em]">{banner}</span>
      </p>
      <div className="flex min-h-0 flex-1 flex-col p-2">
        <TableBoard {...props} />
      </div>
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
    </div>
  );
}
