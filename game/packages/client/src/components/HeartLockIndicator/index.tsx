// 心锁骰面指示器 - 蓝色不掷，显示当前层心锁值
// 对照：plans/design/06-frontend-design.md §6.4.2 HeartLockIndicator

import { cn } from '../../lib/utils.js';

export interface HeartLockIndicatorProps {
  /** 当前心锁值 */
  count: number;
  /** 最大心锁值（用于空位显示） */
  max?: number;
  /** 附加类名 */
  className?: string;
}

export function HeartLockIndicator({ count, max, className }: HeartLockIndicatorProps) {
  const displayMax = max ?? Math.max(count, 1);

  return (
    <div className={cn('flex items-center gap-1', className)} aria-label={`心锁 ${count}`}>
      {Array.from({ length: displayMax }, (_, i) => (
        <span
          key={i}
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded text-sm font-bold',
            i < count ? 'bg-blue-500 text-white shadow-sm' : 'bg-blue-500/20 text-blue-300/40',
          )}
        >
          ♥
        </span>
      ))}
      <span className="ml-1 text-xs text-muted-foreground">
        {count}/{displayMax}
      </span>
    </div>
  );
}
