// PixelAvatar - 8×8 像素艺术头像组件
// 对照：plans/design/06-frontend-design.md §6.7 / ADR-032
//
// 设计：
//   - 无状态渲染组件：给 seed 就出图
//   - 直接输出 SVG（scale 任意，不需要 canvas 2D）
//   - aria-label 读作 "玩家头像 (seed 后 6 位)"

import { useMemo } from 'react';
import { generatePixelAvatar } from '@icgame/shared';
import { cn } from '../../lib/utils';

export interface PixelAvatarProps {
  readonly seed: string;
  readonly size?: number; // 渲染像素宽度（默认 48）
  readonly rounded?: boolean; // 是否圆角（默认 true）
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function PixelAvatar({
  seed,
  size = 48,
  rounded = true,
  className,
  ariaLabel,
}: PixelAvatarProps) {
  const avatar = useMemo(() => generatePixelAvatar(seed), [seed]);

  // 每个像素的边长（8×8 网格分 size）
  const pixelSize = size / 8;

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `玩家头像 ${seed.slice(-6)}`}
      className={cn(
        'inline-block overflow-hidden shadow-sm ring-1 ring-border',
        rounded ? 'rounded-lg' : '',
        className,
      )}
      style={{ width: size, height: size, background: avatar.backgroundColor }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {avatar.grid.map((row, y) =>
          row.map((filled, x) =>
            filled ? (
              <rect
                key={`${x}-${y}`}
                x={x * pixelSize}
                y={y * pixelSize}
                width={pixelSize}
                height={pixelSize}
                fill={avatar.foregroundColor}
              />
            ) : null,
          ),
        )}
      </svg>
    </div>
  );
}
