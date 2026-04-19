// HeartLockIndicator - 心锁骰视觉（蓝色骰面常亮，不掷）
// 对照：plans/design/06-frontend-design.md §6.4.2 HeartLockIndicator
//        Spike: experimental_demo/dice-svg-css3d（蓝色 1-6 SVG）
//
// 变更（B8.2）：
//   - 单色蓝骰面图取代 ♥ 符号
//   - count ∈ [0, 6]：0 → 灰色空骰；1-6 → 对应点数蓝骰 SVG
//   - 明确 "不掷"：无动画、静态展示
//   - max 参数保留语义（显示 count/max 文案），但视觉主体始终是单个骰面

import { cn } from '../../lib/utils.js';
import { diceSvgPath } from '../Dice3D/index.js';

export interface HeartLockIndicatorProps {
  /** 当前心锁值（0-6） */
  count: number;
  /** 最大值（用于显示 count/max 文案），默认 count 或 1 */
  max?: number;
  /** 尺寸 (px) */
  size?: number;
  /** 附加类名 */
  className?: string;
}

export function HeartLockIndicator({ count, max, size = 40, className }: HeartLockIndicatorProps) {
  const clamped = Math.max(0, Math.min(count, 6));
  const displayMax = max ?? Math.max(count, 1);

  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      aria-label={`心锁 ${count}/${displayMax}`}
    >
      {clamped === 0 ? (
        <div
          className="flex items-center justify-center rounded-lg bg-blue-500/10 text-xs font-semibold text-blue-500/40 ring-1 ring-blue-500/20"
          style={{ width: size, height: size }}
          aria-hidden="true"
        >
          0
        </div>
      ) : (
        <img
          src={diceSvgPath('blue', clamped)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="select-none drop-shadow-sm"
          style={{ width: size, height: size }}
        />
      )}
      <span className="text-xs font-medium text-muted-foreground">
        {count}
        <span className="opacity-60">/{displayMax}</span>
      </span>
    </div>
  );
}
