// 移动布局顶栏：回合与阶段 · 当前行动者 · 牌库张数 · 主题入口；有截止时间时多一行剩余秒数
// 顶部让出刘海 / 状态栏的安全区。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { ThemeMenu } from '../shared/ThemeMenu';
import type { MatchController } from '../controllerTypes';

interface MobileTopBarProps {
  readonly controller: MatchController;
  /** 右上角补充内容（好友房的房间码） */
  readonly topRight?: ReactNode;
}

export function MobileTopBar({ controller, topRight }: MobileTopBarProps) {
  const { t } = useTranslation();
  const { turn } = controller;
  const actor = turn.isMine
    ? t('localMatch.yourTurn')
    : t(turn.otherTurn.key, turn.otherTurn.params);

  return (
    <header className="tabletop-phone-topbar">
      <div>
        <h1>盗梦都市</h1>
        <p>
          <span>
            回合 {turn.number} · {t(`localMatch.phase.${turn.phase}`, { defaultValue: turn.phase })}
          </span>
          <strong data-testid="turn-indicator" data-mine={turn.isMine || undefined}>
            {actor}
          </strong>
          {turn.deadlineSeconds !== null && (
            <span data-testid="deadline">
              <Timer size={12} />
              {turn.deadlineSeconds}s
            </span>
          )}
        </p>
      </div>
      {topRight}
      <ThemeMenu className="size-11" />
    </header>
  );
}
