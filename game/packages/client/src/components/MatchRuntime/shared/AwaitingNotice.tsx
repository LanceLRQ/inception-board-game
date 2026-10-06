// 等待提示：对局正在等某位玩家应答、而界面没有对应操作时显示（移动、桌面共用）

import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { AwaitingNotice as AwaitingNoticeModel } from '../awaitingNotice';

interface AwaitingNoticeProps {
  readonly awaiting: AwaitingNoticeModel | null;
  readonly className?: string;
}

export function AwaitingNotice({ awaiting, className }: AwaitingNoticeProps) {
  const { t } = useTranslation();
  if (!awaiting) return null;
  return (
    <div className={cn('text-xs text-dim', className)} role="status" data-testid="awaiting-notice">
      {awaiting.mine
        ? t('match.waiting_auto', {
            defaultValue: '这一步暂时不能手动操作，到时间后由系统代为处理',
          })
        : t('match.waiting_others', { defaultValue: '等待其他玩家应答' })}
    </div>
  );
}
