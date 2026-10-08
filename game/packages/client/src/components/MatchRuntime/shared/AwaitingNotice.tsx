// 等待提示：对局正在等某位玩家应答、而界面没有对应操作时显示（移动、桌面共用）

import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { AwaitingNotice as AwaitingNoticeModel } from '../awaitingNotice';

interface AwaitingNoticeProps {
  readonly awaiting: AwaitingNoticeModel | null;
  /** 轮到本人时已有应答窗口 / 响应条承担操作，等待提示不再显示 */
  readonly hasResponseUi: boolean;
  readonly className?: string;
}

export function AwaitingNotice({ awaiting, hasResponseUi, className }: AwaitingNoticeProps) {
  const { t } = useTranslation();
  if (!awaiting || (awaiting.mine && (hasResponseUi || awaiting.hasOwnUi))) return null;
  return (
    <div className={cn('text-xs text-dim', className)} role="status" data-testid="awaiting-notice">
      {awaiting.mine
        ? t('match.waiting_auto', {
            defaultValue: '这一步暂时无法操作，请稍候',
          })
        : awaiting.master
          ? t('match.waiting_master', { defaultValue: '等待梦主应答' })
          : t('match.waiting_others', { defaultValue: '等待其他玩家应答' })}
    </div>
  );
}
