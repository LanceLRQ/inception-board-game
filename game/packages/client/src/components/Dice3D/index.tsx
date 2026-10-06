// 3D 骰子组件：六个骰面用 Die 组件绘制（颜色取令牌、形状随主题皮肤），CSS 3D 变换做翻滚；
// reduced-motion 降级：直接展示终值骰面。

import { useEffect, useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/utils.js';
import { useSoundEffect } from '../../hooks/useSoundEffect.js';
import { Die, type DieKind } from '../Die';

export interface Dice3DProps {
  /** 最终面值 (1-6)，undefined 表示正在掷 */
  value?: number;
  /** 骰子种类：战斗骰（红）/ 心锁骰（蓝） */
  kind?: DieKind;
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

function DiceFace({ value, kind, size }: { value: number; kind: DieKind; size: number }) {
  return <Die value={value} kind={kind} size={size} label="" className="select-none" />;
}

export function Dice3D({
  value,
  kind = 'combat',
  rolling = false,
  onRollComplete,
  size = 48,
  className,
}: Dice3DProps) {
  const prefersReduced = useReducedMotion();
  const playSound = useSoundEffect();

  // 掷骰动画：只在 rolling 时快速切换面值
  const [rollingValue, setRollingValue] = useState(1);
  const displayValue = rolling ? rollingValue : (value ?? 1);

  useEffect(() => {
    if (!rolling) return;
    // 掷骰开始：播放哗啦声
    playSound('dice-start');

    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count < 8) {
        setRollingValue(Math.floor(Math.random() * 6) + 1);
      } else {
        clearInterval(interval);
        setRollingValue(value ?? 1);
        // 掷骰结束：落定声
        playSound('dice-land');
        onRollComplete?.();
      }
    }, 80);

    return () => clearInterval(interval);
  }, [rolling, value, onRollComplete, playSound]);

  const rotation = useMemo(() => FACE_ROTATION[displayValue] ?? { x: 0, y: 0 }, [displayValue]);

  // reduced-motion 降级：直接展示终值
  if (prefersReduced) {
    return (
      <div
        className={cn('inline-block', className)}
        style={{ width: size, height: size }}
        aria-label={`骰子 ${displayValue}`}
      >
        <DiceFace value={displayValue} kind={kind} size={size} />
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
            <DiceFace value={face} kind={kind} size={size} />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
