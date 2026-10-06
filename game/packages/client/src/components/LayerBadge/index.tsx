// LayerBadge - 梦境层数徽标（L0-L4）
// 位置：PlayerSeat 右侧

import { cn } from '../../lib/utils.js';

export interface LayerBadgeProps {
  layer: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
} as const;

/** 按层数返回对应的层级色梯度 class：越深的层填充越浓（L0 迷失层特殊处理） */
function layerColorClass(layer: number): string {
  if (layer === 0) return 'border-line-strong bg-panel-2 text-foreground';
  const palette = [
    'border-grade/40 bg-grade/10 text-foreground', // L1 占位
    'border-grade/60 bg-grade/20 text-foreground', // L2
    'border-grade/80 bg-grade/35 text-foreground', // L3
    'border-grade bg-grade/50 text-foreground', // L4
  ];
  return palette[(layer - 1) % palette.length] ?? palette[0]!;
}

export function LayerBadge({ layer, size = 'md', className }: LayerBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full border font-bold tabular-nums',
        SIZE_MAP[size],
        layerColorClass(layer),
        className,
      )}
      aria-label={`梦境层 ${layer}`}
    >
      L{layer}
    </div>
  );
}
