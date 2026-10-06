// 卡图预载进度：顶栏下方一条细进度线，全部就绪后淡出

import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { PreloadProgress } from '../controllerTypes';

export function MobilePreloadLine({ preload }: { preload: PreloadProgress | null }) {
  const { t } = useTranslation();
  if (!preload || preload.total <= 0) return null;
  const done = preload.loaded === preload.total;
  const percent = Math.round((preload.loaded / preload.total) * 100);
  return (
    <div
      role="progressbar"
      aria-label={t('mobile.preload.aria')}
      aria-valuemin={0}
      aria-valuemax={preload.total}
      aria-valuenow={preload.loaded}
      aria-valuetext={t('mobile.preload.label', { loaded: preload.loaded, total: preload.total })}
      data-testid="asset-preload-progress"
      className={cn(
        'h-0.5 w-full shrink-0 bg-line transition-opacity duration-500',
        done ? 'opacity-30' : 'opacity-100',
      )}
    >
      <div
        className={cn(
          'h-full transition-[width] duration-200',
          preload.failed > 0 ? 'bg-blood' : 'bg-acc',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
