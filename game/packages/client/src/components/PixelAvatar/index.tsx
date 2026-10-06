// PixelAvatar - 8×8 像素艺术头像组件
//
// 设计：
//   - 无状态渲染组件：给 seed 就出图
//   - 直接输出 SVG（scale 任意，不需要 canvas 2D）
//   - 头像自带的调色板（来自共享的生成算法）是浅底配彩色像素，在任何主题下都靠一圈描边
//     与周围分开：描边用主题的强分隔线令牌，亮色与暗色主题下都看得清
//   - 没有 aria-label 时视为装饰性（座位牌、占位者标签旁已有昵称），不朗读

import { useMemo } from 'react';
import { generatePixelAvatar } from '@icgame/shared';
import { cn } from '../../lib/utils';

export interface PixelAvatarProps {
  readonly seed: string;
  readonly size?: number; // 渲染像素宽度（默认 48）
  readonly rounded?: boolean; // 是否圆角（默认 true）
  readonly className?: string;
  /** 需要朗读时给；不给就是装饰性头像 */
  readonly ariaLabel?: string;
}

export function PixelAvatar({
  seed,
  size = 48,
  rounded = true,
  className,
  ariaLabel,
}: PixelAvatarProps) {
  const avatar = useMemo(() => generatePixelAvatar(seed || 'player'), [seed]);

  // 每个像素的边长（8×8 网格分 size）
  const pixelSize = size / 8;

  return (
    <div
      role={ariaLabel ? 'img' : 'presentation'}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      data-testid="pixel-avatar"
      data-seed={seed}
      className={cn(
        'inline-block shrink-0 overflow-hidden border border-line-strong',
        rounded ? 'rounded-[3px]' : '',
        className,
      )}
      style={{ width: size, height: size, background: avatar.backgroundColor }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
        className="block"
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
