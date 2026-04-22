// LayerBadge - 梦境层数徽标（L0-L4）
// 对照：plans/design/06c-match-table-layout.md §5.1 （PlayerSeat 右侧 / ActionDock 中）

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

/** 按层数返回对应的紫色梯度 class（L0 迷失层特殊处理） */
function layerColorClass(layer: number): string {
  if (layer === 0) return 'border-slate-500 bg-slate-700 text-slate-200';
  const palette = [
    'border-purple-700 bg-purple-900/60 text-purple-100', // L1 占位
    'border-purple-600 bg-purple-800/60 text-purple-100', // L2
    'border-fuchsia-500 bg-fuchsia-700/60 text-fuchsia-100', // L3
    'border-pink-500 bg-pink-700/60 text-pink-100', // L4
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
