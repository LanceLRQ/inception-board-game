// StorageBanner - 服务端暂时无法保存进度时的顶部提示
//
// 对局仍可继续操作，服务端在后台重试；存储恢复后提示自动消失。

import { CloudOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface StorageBannerProps {
  readonly visible: boolean;
}

export function StorageBanner({ visible }: StorageBannerProps) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="storage-banner"
      className="fixed top-0 inset-x-0 z-50 flex items-center gap-2 bg-orange-500/95 px-4 py-2 text-sm font-medium text-white"
    >
      <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        {t('network.storage_degraded', { defaultValue: '服务器暂时无法保存进度，正在重试' })}
      </span>
    </div>
  );
}
