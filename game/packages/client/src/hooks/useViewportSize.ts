// useViewportSize - 订阅窗口内部尺寸（innerWidth / innerHeight）
// 桌面布局据此计算整体放大系数；服务端渲染 / 非浏览器环境给参照尺寸。

import { useSyncExternalStore } from 'react';

export interface ViewportSize {
  readonly w: number;
  readonly h: number;
}

const FALLBACK: ViewportSize = { w: 1280, h: 800 };
let cached: ViewportSize = FALLBACK;

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

/** 尺寸没变时返回同一个对象，避免 useSyncExternalStore 因引用变化反复渲染 */
function getSnapshot(): ViewportSize {
  if (typeof window === 'undefined') return FALLBACK;
  if (cached.w !== window.innerWidth || cached.h !== window.innerHeight) {
    cached = { w: window.innerWidth, h: window.innerHeight };
  }
  return cached;
}

export function useViewportSize(): ViewportSize {
  return useSyncExternalStore(subscribe, getSnapshot, () => FALLBACK);
}
