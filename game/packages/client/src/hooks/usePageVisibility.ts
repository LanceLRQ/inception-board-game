// usePageVisibility - 监听 document.visibilitychange
// 对照：plans/design/07-backend-network.md §7.4.6 / 08-security-ai.md §8.5.3
//
// 核心需求：
//   - hidden → visible 时计算离开时长
//   - <3min 静默重连 ； >=3min 触发硬关回调
//   - 提供 onReturn 回调给上层决策
//
// 逻辑拆分：computeAwayDuration 纯函数可单测；hook 只做 React wrap + DOM 监听

import { useEffect, useRef } from 'react';

export interface PageVisibilityOptions {
  /** hidden → visible 时的回调，awayMs = 离开时长 */
  readonly onReturn?: (awayMs: number) => void;
  /** 硬关阈值（毫秒，默认 3min） */
  readonly hardCutoffMs?: number;
  /** 超过硬关阈值的回调 */
  readonly onHardCutoff?: (awayMs: number) => void;
}

/** 计算离开时长（纯函数，可测） */
export function computeAwayDuration(leftAt: number | null, returnedAt: number): number {
  if (leftAt === null || leftAt <= 0) return 0;
  if (returnedAt <= leftAt) return 0;
  return returnedAt - leftAt;
}

/** 判断是否超过硬关阈值（纯函数，可测） */
export function isHardCutoff(awayMs: number, thresholdMs: number): boolean {
  return awayMs >= thresholdMs;
}

export function usePageVisibility(opts: PageVisibilityOptions = {}): void {
  const leftAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const onChange = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        leftAtRef.current = now;
      } else if (document.visibilityState === 'visible') {
        const awayMs = computeAwayDuration(leftAtRef.current, now);
        leftAtRef.current = null;
        if (awayMs > 0) {
          opts.onReturn?.(awayMs);
          const threshold = opts.hardCutoffMs ?? 180_000;
          if (isHardCutoff(awayMs, threshold)) {
            opts.onHardCutoff?.(awayMs);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [opts]);
}
