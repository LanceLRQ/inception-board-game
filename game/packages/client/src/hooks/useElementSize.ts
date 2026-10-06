// useElementSize - 用 ResizeObserver 跟踪元素的内容区尺寸
// 首次挂载时同步量一次（避免先渲染一帧错误尺寸），之后随尺寸变化更新。

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
      const rect = node.getBoundingClientRect();
      setSize((prev) =>
        Math.round(prev.w) === Math.round(rect.width) &&
        Math.round(prev.h) === Math.round(rect.height)
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return [ref, size];
}
