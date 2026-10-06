// AssetLoadingScreen - 进入对局前的素材加载界面：显示真实的已加载 / 总数，失败的素材不阻塞进入
//
// 缓存里已有素材时几乎瞬间加载完，所以只有加载超过 GATE_DELAY_MS 才显示（不闪一下）；
// 超过 GATE_MAX_MS 还没加载完就放行：剩下的素材在对局里按需加载，卡图失败时由 CardArt 显示文字占位。
// 样式只用语义令牌；用户选了减少动效时脉冲动画由全局样式取消。

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PreloadProgress } from '../MatchRuntime/controllerTypes';

/** 加载超过这么久才显示加载界面 */
export const GATE_DELAY_MS = 250;
/** 加载界面最长停留时间，超时放行 */
export const GATE_MAX_MS = 8_000;

/** 纯函数：进度百分比 (0..100)，总数为 0 按 0 算 */
export function computePercent(p: Pick<PreloadProgress, 'loaded' | 'total'>): number {
  if (p.total <= 0) return 0;
  return Math.min(100, Math.round((p.loaded / p.total) * 100));
}

/** 纯函数：此刻是否要显示加载界面（进度还没走完、已过延迟、没到放行上限） */
export function gateShown(
  progress: Pick<PreloadProgress, 'loaded' | 'total'> | null,
  elapsedMs: number,
): boolean {
  if (progress === null || progress.total <= 0) return false;
  if (progress.loaded >= progress.total) return false;
  return elapsedMs >= GATE_DELAY_MS && elapsedMs < GATE_MAX_MS;
}

export function MatchAssetGate({ entry }: { readonly entry: PreloadProgress | null }) {
  const { t } = useTranslation();
  const active = entry !== null && entry.total > 0 && entry.loaded < entry.total;
  // 计时从素材开始加载算起；两个定时点各翻一次状态，之后不再需要时钟
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const show = setTimeout(() => setElapsed(GATE_DELAY_MS), GATE_DELAY_MS);
    const giveUp = setTimeout(() => setElapsed(GATE_MAX_MS), GATE_MAX_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(giveUp);
    };
  }, [active]);

  if (!entry || !gateShown(entry, elapsed)) return null;
  const pct = computePercent(entry);
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background p-8 text-foreground"
      role="status"
      aria-live="polite"
      data-testid="asset-loading-screen"
    >
      <div
        className="flex size-16 items-center justify-center border border-acc font-heading text-xl font-bold tracking-[.2em] text-acc-bright motion-safe:animate-pulse"
        aria-hidden
      >
        ICO
      </div>
      <h1 className="font-heading text-lg font-bold tracking-[.1em]">{t('loading.title')}</h1>
      <div
        className="h-1.5 w-64 max-w-full overflow-hidden bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={entry.total}
        aria-valuenow={entry.loaded}
        aria-label={t('loading.title')}
      >
        <div
          className="h-full bg-acc transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm tabular-nums text-dim" data-testid="asset-loading-count">
        {t('loading.progress', { loaded: entry.loaded, total: entry.total })}
      </p>
      {entry.failed > 0 && (
        <p className="text-xs text-blood" data-testid="asset-loading-failed">
          {t('loading.failed', { count: entry.failed })}
        </p>
      )}
    </div>
  );
}
