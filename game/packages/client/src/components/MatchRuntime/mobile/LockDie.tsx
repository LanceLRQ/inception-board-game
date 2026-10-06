// 心锁骰：用 CSS 画的点阵骰，底色取心锁令牌，点用背景色；0 表示已解开，画成虚线空骰

import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { pipsFor } from './pips';

interface LockDieProps {
  readonly value: number;
  /** 骰子边长（像素） */
  readonly size?: number;
  readonly className?: string;
}

export function LockDie({ value, size = 16, className }: LockDieProps) {
  const { t } = useTranslation();
  const pips = pipsFor(value);
  const pipSize = Math.max(2, Math.round(size * 0.19));
  return (
    <span
      role="img"
      aria-label={t('mobile.tower.heartLock', { n: value })}
      className={cn(
        'relative inline-block shrink-0 rounded-[3px]',
        pips.length > 0 ? 'bg-lock' : 'border border-dashed border-lock',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {pips.map(([x, y]) => (
        <i
          key={`${x}-${y}`}
          className="absolute rounded-full bg-background"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: pipSize,
            height: pipSize,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </span>
  );
}
