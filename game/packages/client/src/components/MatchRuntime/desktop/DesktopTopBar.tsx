// 片头条：对局标识 / 房间码、回合与阶段、当前行动者、截止剩余秒数、短语与主题入口
// 样式钩子类名：ms-topbar。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { MatchController } from '../controllerTypes';
import { ThemeMenu } from '../shared/ThemeMenu';
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
    <header className="tabletop-topbar" data-testid="desktop-topbar">
      <div className="tabletop-brand">
        <span aria-hidden>◇</span>
        <h1>{t('desktop.top.brand')}</h1>
        {matchId && <small>{matchId}</small>}
      </div>
      <div className="tabletop-turn">
        <span className="shrink-0 text-dim">
          {t('localMatch.turn')} {turn.number}
          <span className="mx-2 text-faint">·</span>
          {t(`localMatch.phase.${turn.phase}`, { defaultValue: turn.phase })}
        </span>
        <span
          className={cn('tabletop-actor', turn.isMine ? 'text-acc-bright' : 'text-foreground')}
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
        <ThemeMenu className="size-6 border border-line-strong" />
        {topRight}
      </span>
    </header>
  );
}
