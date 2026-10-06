// 卡图预加载的后台进度：顶栏下方一条细进度线，全部就绪后淡出（移动、桌面共用）
// 不占布局高度（零高度的容器 + 绝对定位的线）：进度线出现与消失不会让舞台尺寸跳变，
// 否则会触发依赖容器尺寸的主题特效（如数字雨）重建画布。

import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { PreloadProgress } from '../controllerTypes';

export function PreloadLine({ preload }: { preload: PreloadProgress | null }) {
  const { t } = useTranslation();
  if (!preload || preload.total <= 0) return null;
  const done = preload.loaded === preload.total;
  const percent = Math.round((preload.loaded / preload.total) * 100);
  return (
    <div className="relative z-10 h-0 w-full shrink-0">
      <div
        role="progressbar"
        aria-label={t('preload.aria')}
        aria-valuemin={0}
        aria-valuemax={preload.total}
        aria-valuenow={preload.loaded}
        aria-valuetext={t('preload.label', { loaded: preload.loaded, total: preload.total })}
        data-testid="asset-preload-progress"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-line transition-opacity duration-500',
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
    </div>
  );
}
