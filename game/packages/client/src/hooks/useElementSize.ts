// useElementSize - 用 ResizeObserver 跟踪元素的布局尺寸
// 首次挂载时同步量一次（避免先渲染一帧错误尺寸），之后随尺寸变化更新。
// 取 offsetWidth / offsetHeight 而不是 getBoundingClientRect：前者是布局像素，
// 不受祖先上 transform: scale 的影响（桌面布局在大屏上会整体放大）。

import { useCallback, useLayoutEffect, useState } from 'react';

export interface ElementSize {
  readonly w: number;
  readonly h: number;
}

const EMPTY: ElementSize = { w: 0, h: 0 };

export function useElementSize<T extends HTMLElement>(): [(node: T | null) => void, ElementSize] {
  const [size, setSize] = useState<ElementSize>(EMPTY);
  const [node, setNode] = useState<T | null>(null);

  const ref = useCallback((el: T | null) => setNode(el), []);

  useLayoutEffect(() => {
    if (!node) return;
    const measure = () => {
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return [ref, size];
}
