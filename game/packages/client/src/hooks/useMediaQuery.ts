// useMediaQuery - 订阅 window.matchMedia 变化
// 用于对局界面按视口宽度分派 PC/移动端布局
//
// 实现：useSyncExternalStore（React 18+ 官方推荐，精准订阅外部可变源），
// 避免 useEffect 里 setState 同步调用引发的级联渲染告警。

import { useCallback, useSyncExternalStore } from 'react';

/**
 * @param query CSS media query string, e.g. '(min-width: 1024px)'
 * @param defaultValue SSR / 非浏览器环境下的初值（默认 false）
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return defaultValue;
    return window.matchMedia(query).matches;
  }, [query, defaultValue]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
