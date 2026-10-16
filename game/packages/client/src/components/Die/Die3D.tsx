// 立体骰子：六个面是平面骰（Die）拼成的立方体，先翻滚几圈再停在点数那一面正对观察者
// 「减少动效」时直接画停下来的那一面。颜色与质感沿用平面骰的皮肤（ms-die）。

import { motion, useReducedMotionConfig } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Die, type DieKind } from './index';

/** 六个面：点数与该面自身的朝向（度），相对的两面点数相加为 7 */
export const CUBE_FACES: readonly { value: number; x: number; y: number }[] = [
  { value: 1, x: 0, y: 0 },
  { value: 6, x: 0, y: 180 },
  { value: 3, x: 0, y: 90 },
  { value: 4, x: 0, y: -90 },
  { value: 2, x: 90, y: 0 },
  { value: 5, x: -90, y: 0 },
];

/** 立方体转到哪个角度，点数那一面正对观察者；不是 1-6 时按 1 处理 */
export function cubeRotationFor(value: number): { x: number; y: number } {
  const face = CUBE_FACES.find((f) => f.value === value) ?? CUBE_FACES[0]!;
  return { x: -face.x, y: -face.y };
}

interface Die3DProps {
  readonly value: number;
  readonly kind?: DieKind;
  /** 边长（像素） */
  readonly size?: number;
  /** 翻滚时长（秒） */
  readonly seconds?: number;
  /** 起手多转几圈，同一批骰子各不相同看起来才不像复制品 */
  readonly spin?: number;
}

export function Die3D({ value, kind = 'combat', size = 48, seconds = 0.7, spin = 2 }: Die3DProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotionConfig() === true;
  const label = t('die.combat', { n: value });
  if (reduced) return <Die value={value} kind={kind} size={size} label={label} />;
  const end = cubeRotationFor(value);
  const half = size / 2;
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-block"
      style={{ width: size, height: size, perspective: size * 6 }}
    >
      <motion.span
        className="relative block size-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={{ rotateX: end.x + 360 * spin + 45, rotateY: end.y - 360 * spin - 30 }}
        animate={{ rotateX: end.x, rotateY: end.y }}
        transition={{ duration: seconds, ease: [0.2, 0.7, 0.3, 1] }}
      >
        {CUBE_FACES.map((face) => (
          <span
            key={face.value}
            className="absolute inset-0"
            style={{
              transform: `rotateX(${face.x}deg) rotateY(${face.y}deg) translateZ(${half}px)`,
              backfaceVisibility: 'hidden',
            }}
          >
            <Die value={face.value} kind={kind} size={size} label="" />
          </span>
        ))}
      </motion.span>
    </span>
  );
}
