// 二维码图片：SVG 渲染，扫码需要「深色码点 + 浅色底」，所以颜色不跟随主题（见样式表里的 .qr-frame）

import { useMemo } from 'react';
import { encodeQr, qrToSvgPath } from '../../lib/qrEncoder';

const QUIET_ZONE_MODULES = 4;

export interface QrImageProps {
  value: string;
  /** 屏幕阅读器读到的说明 */
  label: string;
  className?: string;
  'data-testid'?: string;
}

/** 内容太长放不进二维码时返回 null（调用方可据此隐藏入口） */
export function QrImage({ value, label, className, 'data-testid': testId }: QrImageProps) {
  const drawing = useMemo(() => {
    try {
      const matrix = encodeQr(value);
      return {
        path: qrToSvgPath(matrix, QUIET_ZONE_MODULES),
        size: matrix.length + QUIET_ZONE_MODULES * 2,
      };
    } catch {
      return null;
    }
  }, [value]);

  if (drawing === null) return null;
  return (
    <svg
      viewBox={`0 0 ${drawing.size} ${drawing.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={className}
      data-testid={testId}
    >
      <path d={drawing.path} fill="currentColor" />
    </svg>
  );
}
