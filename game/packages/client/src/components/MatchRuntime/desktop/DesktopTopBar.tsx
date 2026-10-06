// 片头条：对局标识 / 房间码、回合与阶段、当前行动者、截止剩余秒数
// 样式钩子类名：ms-topbar。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { MatchController } from '../controllerTypes';
import { ChatMenu } from './ChatMenu';

interface DesktopTopBarProps {
  readonly controller: MatchController;
  /** 右侧补充内容（好友房的房间码） */
  readonly topRight?: ReactNode;
}

/** 对局编号只取前 8 位，太长的编号在片头条里没有意义 */
export function shortMatchId(matchId: string | undefined): string {
  return matchId ? matchId.slice(0, 8).toUpperCase() : '';
}

export function DesktopTopBar({ controller, topRight }: DesktopTopBarProps) {
  const { t } = useTranslation();
  const { turn, view } = controller;
  const actor = turn.isMine
    ? t('localMatch.yourTurn')
    : t(turn.otherTurn.key, turn.otherTurn.params);
  const matchId = shortMatchId(view?.matchId);

  return (
    <header
      className="ms-topbar flex h-9 shrink-0 items-center gap-6 px-4 font-mono text-[10.5px] tracking-[.16em] text-faint"
      data-testid="desktop-topbar"
    >
      <span className="shrink-0 truncate">
        {t('desktop.top.brand')}
        {matchId && ` — ${t('desktop.top.match', { id: matchId })}`}
      </span>
      <div className="mx-auto flex min-w-0 items-center gap-5">
        <span className="shrink-0 text-dim">
          {t('localMatch.turn')} {turn.number}
          <span className="mx-2 text-faint">·</span>
          {t(`localMatch.phase.${turn.phase}`, { defaultValue: turn.phase })}
        </span>
        <span
          className={cn(
            'min-w-0 truncate font-heading text-[13px] font-bold tracking-[.1em]',
            turn.isMine ? 'text-acc-bright' : 'text-foreground',
          )}
          data-testid="turn-indicator"
          data-mine={turn.isMine || undefined}
        >
          {actor}
        </span>
        {turn.deadlineSeconds !== null && (
          <span
            className="flex shrink-0 items-center gap-1 tabular-nums text-dim"
            data-testid="deadline"
          >
            <Timer className="size-3" aria-hidden />
            {t('match.deadline', { seconds: turn.deadlineSeconds })}
          </span>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-2">
        <ChatMenu controller={controller} />
        {topRight}
      </span>
    </header>
  );
}
