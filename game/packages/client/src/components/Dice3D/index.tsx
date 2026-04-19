// 3D 骰子组件 - SVG 底图 + CSS 3D 变换 + reduced-motion 降级
// 对照：plans/design/06-frontend-design.md §6.6 Dice3D / Spike: experimental_demo/dice-svg-css3d
//
// 变更（B8.2）：
//   - 骰子面从 CSS Grid 点阵升级为预渲染 SVG 图（/dice/dice-{color}-{face}.svg）
//   - 保留 3D rotate + rolling 动画
//   - reduced-motion 降级：直接展示终值 SVG

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

export function diceSvgPath(color: DiceColor, face: number): string {
  return `/dice/dice-${color}-${face}.svg`;
}

function DiceFace({ value, color, size }: { value: number; color: DiceColor; size: number }) {
  return (
    <img
      src={diceSvgPath(color, value)}
      alt=""
      aria-hidden="true"
      className="h-full w-full select-none"
      draggable={false}
      style={{ width: size, height: size }}
    />
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

  // 掷骰动画：只在 rolling 时快速切换面值
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

  // reduced-motion 降级：直接展示 SVG 终值
  if (prefersReduced) {
    return (
      <div
        className={cn('inline-block', className)}
        style={{ width: size, height: size }}
        aria-label={`骰子 ${displayValue}`}
      >
        <DiceFace value={displayValue} color={color} size={size} />
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
            className="absolute inset-0"
            style={{
              transform: `translateZ(${size / 2}px) ${face !== 1 ? `rotateX(${FACE_ROTATION[face]?.x ?? 0}deg) rotateY(${FACE_ROTATION[face]?.y ?? 0}deg) translateZ(${size / 2}px)` : ''}`,
              backfaceVisibility: 'hidden',
            }}
          >
            <DiceFace value={face} color={color} size={size} />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
