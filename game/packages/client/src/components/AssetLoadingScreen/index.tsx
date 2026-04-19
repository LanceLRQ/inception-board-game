// AssetLoadingScreen - 启动预加载进度屏（ADR-042）
// 对照：plans/design/06-frontend-design.md §6.17.6
//
// 特性：
//   - 启动时调用 AssetPreloader.loadManifest + preloadCritical
//   - 显示进度条 + 已加载 / 总数 + 字节数
//   - 失败卡图数量提示（不阻断）
//   - prefers-reduced-motion 时 pulse 动画降级为静态
//
// 不阻断：即便 manifest 加载失败，5s 后也会 onComplete 放行（弱网模式）

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assetPreloader, type PreloadProgress } from '../../lib/assetPreloader.js';
import { cn } from '../../lib/utils.js';

export interface AssetLoadingScreenProps {
  /** 全部完成（含失败）后触发，由外层 router 决定下一步 */
  readonly onComplete: () => void;
  /** 最长等待时间（ms），超时强制放行。默认 5000 */
  readonly timeoutMs?: number;
}

// 纯函数：格式化字节数（便于单测）
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 纯函数：基于 progress 计算百分比 (0..100)，0 状态按 0 算
export function computePercent(p: Pick<PreloadProgress, 'loaded' | 'total'>): number {
  if (p.total <= 0) return 0;
  return Math.min(100, Math.round((p.loaded / p.total) * 100));
}

export function AssetLoadingScreen({ onComplete, timeoutMs = 5000 }: AssetLoadingScreenProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<PreloadProgress>({
    tier: 'critical',
    loaded: 0,
    total: 0,
    failed: [],
    bytesLoaded: 0,
    bytesTotal: 0,
  });
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hardTimeout = setTimeout(() => {
      if (!cancelled && !done) {
        setDone(true);
        onComplete();
      }
    }, timeoutMs);

    (async () => {
      await assetPreloader.loadManifest();
      if (cancelled) return;
      const finalProg = await assetPreloader.preloadCritical((p) => {
        if (!cancelled) setProgress(p);
      });
      if (cancelled) return;
      setProgress(finalProg);
      setDone(true);
      clearTimeout(hardTimeout);
      onComplete();
    })().catch(() => {
      // 兜底：loadManifest/preloadCritical 都有自己的 catch，这里不应进入
      if (!cancelled && !done) {
        setDone(true);
        onComplete();
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(hardTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onComplete 稳定引用由父组件保证
  }, []);

  const pct = computePercent(progress);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-8"
      role="status"
      aria-live="polite"
      aria-label={t('loading.title', { defaultValue: '正在准备梦境...' })}
    >
      <div
        className={cn(
          'flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-3xl font-bold text-primary',
          'motion-safe:animate-pulse',
        )}
        aria-hidden="true"
      >
        ICO
      </div>

      <h1 className="mt-6 text-xl font-semibold text-foreground">
        {t('loading.title', { defaultValue: '正在准备梦境...' })}
      </h1>

      <div
        className="mt-6 h-2 w-64 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {progress.total > 0
          ? `${progress.loaded} / ${progress.total} · ${formatBytes(progress.bytesLoaded)}`
          : t('loading.waiting', { defaultValue: '等待资源清单...' })}
      </p>

      {progress.failed.length > 0 && (
        <p className="mt-2 text-xs text-destructive">
          {t('loading.failed', {
            defaultValue: '{{count}} 张卡图加载失败，将使用占位',
            count: progress.failed.length,
          })}
        </p>
      )}
    </div>
  );
}
