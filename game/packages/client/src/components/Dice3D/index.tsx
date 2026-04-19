// 3D 骰子组件 - CSS 3D 变换 + reduced-motion 降级
// 对照：plans/design/06-frontend-design.md §6.6 Dice3D

import { useEffect, useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/utils.js';

export type DiceColor = 'red' | 'blue';

export interface Dice3DProps {
  /** 最终面值 (1-6)，undefined 表示正在掷 */
  value?: number;
  /** 骰子颜色 */
  color?: DiceColor;
  /** 是否正在掷骰动画中 */
  rolling?: boolean;
  /** 掷骰完成回调 */
  onRollComplete?: () => void;
  /** 尺寸 (px) */
  size?: number;
  /** 附加类名 */
  className?: string;
}

// 骰子 6 面对应的 CSS rotateX/rotateY
const FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: 180 },
  3: { x: 0, y: 270 },
  4: { x: 0, y: 90 },
  5: { x: 270, y: 0 },
  6: { x: 90, y: 0 },
};

// 骰子面上的点阵
const DOT_PATTERNS: Record<number, number[]> = {
  1: [0, 0, 0, 1, 0, 0, 0],
  2: [0, 0, 1, 0, 1, 0, 0],
  3: [0, 0, 1, 1, 1, 0, 0],
  4: [1, 0, 1, 0, 1, 0, 1],
  5: [1, 0, 1, 1, 1, 0, 1],
  6: [1, 1, 1, 0, 1, 1, 1],
};

function DiceFace({ value, color }: { value: number; color: DiceColor }) {
  const dots = DOT_PATTERNS[value] ?? [];
  return (
    <div
      className={cn(
        'grid grid-cols-3 grid-rows-3 gap-0.5 p-1',
        color === 'red' ? 'bg-red-600' : 'bg-blue-600',
      )}
    >
      {dots.map((has, i) => (
        <div key={i} className="flex h-2 w-2 items-center justify-center">
          {has ? <div className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </div>
      ))}
    </div>
  );
}

export function Dice3D({
  value,
  color = 'red',
  rolling = false,
  onRollComplete,
  size = 48,
  className,
}: Dice3DProps) {
  const prefersReduced = useReducedMotion();

  // 掷骰动画：只在 rolling 时快速切换面值（全部在 interval 回调内 setState）
  const [rollingValue, setRollingValue] = useState(1);
  const displayValue = rolling ? rollingValue : (value ?? 1);

  useEffect(() => {
    if (!rolling) return;

    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count < 8) {
        setRollingValue(Math.floor(Math.random() * 6) + 1);
      } else {
        clearInterval(interval);
        setRollingValue(value ?? 1);
        onRollComplete?.();
      }
    }, 80);

    return () => clearInterval(interval);
  }, [rolling, value, onRollComplete]);

  const rotation = useMemo(() => FACE_ROTATION[displayValue] ?? { x: 0, y: 0 }, [displayValue]);

  // reduced-motion 降级
  if (prefersReduced) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg font-bold text-white',
          color === 'red' ? 'bg-red-600' : 'bg-blue-600',
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={`骰子 ${displayValue}`}
      >
        {displayValue}
      </div>
    );
  }

  return (
    <div
      className={cn('flex items-center justify-center', className)}
      style={{ width: size, height: size, perspective: size * 3 }}
      aria-label={`骰子 ${displayValue}`}
    >
      <motion.div
        className="relative"
        style={{
          width: size,
          height: size,
          transformStyle: 'preserve-3d',
        }}
        animate={{
          rotateX: rotation.x,
          rotateY: rotation.y,
        }}
        transition={{
          duration: rolling ? 0.08 : 0.3,
          ease: 'easeOut',
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <div
            key={face}
            className="absolute inset-0 rounded-lg shadow-md"
            style={{
              transform: `translateZ(${size / 2}px) ${face !== 1 ? `rotateX(${FACE_ROTATION[face]?.x ?? 0}deg) rotateY(${FACE_ROTATION[face]?.y ?? 0}deg) translateZ(${size / 2}px)` : ''}`,
              backfaceVisibility: 'hidden',
            }}
          >
            <DiceFace value={face} color={color} />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
