// 移动布局顶栏：回合与阶段 · 当前行动者 · 牌库张数；有截止时间时多一行剩余秒数
// 顶部让出刘海 / 状态栏的安全区。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { MatchController } from '../controllerTypes';

interface MobileTopBarProps {
  readonly controller: MatchController;
  /** 右上角补充内容（好友房的房间码） */
  readonly topRight?: ReactNode;
}

export function MobileTopBar({ controller, topRight }: MobileTopBarProps) {
  const { t } = useTranslation();
  const { turn, view } = controller;
  const deckCount = view?.deck?.cardCount ?? 0;
  const actor = turn.isMine
    ? t('localMatch.yourTurn')
    : t(turn.otherTurn.key, turn.otherTurn.params);

  return (
    <div className="shrink-0 border-b border-line pt-safe">
      <header className="flex h-11 items-center gap-2.5 px-3.5">
        <div className="flex shrink-0 flex-col font-mono text-[9.5px] leading-tight tracking-[.08em] text-dim">
          <span>
            {t('localMatch.turn')} {turn.number}
          </span>
          <span>{t(`localMatch.phase.${turn.phase}`, { defaultValue: turn.phase })}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
          <span
            className={cn(
              'max-w-full truncate font-heading text-[13px] font-bold tracking-[.08em]',
              turn.isMine ? 'text-acc-bright' : 'text-foreground',
            )}
            data-testid="turn-indicator"
            data-mine={turn.isMine || undefined}
          >
            {actor}
          </span>
          {turn.deadlineSeconds !== null && (
            <span
              className="flex items-center gap-1 font-mono text-[9px] tabular-nums text-dim"
              data-testid="deadline"
            >
              <Timer className="size-2.5" aria-hidden />
              {t('match.deadline', { seconds: turn.deadlineSeconds })}
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[9.5px] leading-tight tracking-[.05em] text-dim">
          <span aria-label={t('mobile.top.deckAria', { n: deckCount })}>
            {t('mobile.top.deck', { n: deckCount })}
          </span>
          {topRight && <span className="max-[359px]:hidden">{topRight}</span>}
        </div>
      </header>
    </div>
  );
}
