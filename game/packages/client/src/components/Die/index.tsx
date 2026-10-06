// 骰子：CSS 绘制的点阵骰，颜色取令牌（心锁骰用 lock，战斗骰用 blood），形状与质感由主题皮肤决定
// 钩子类名 ms-die（见 styles/skins/base.css）；0 表示已解开，画成虚线空骰。

import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { pipsFor } from './pips';

/** 心锁骰（蓝）/ 战斗骰（SHOOT 的红） */
export type DieKind = 'lock' | 'combat';

interface DieProps {
  readonly value: number;
  readonly kind?: DieKind;
  /** 骰子边长（像素） */
  readonly size?: number;
  readonly className?: string;
  /** 无障碍名称；缺省按种类与点数生成。装饰性使用时传空串 */
  readonly label?: string;
}

/** 点的直径随骰子大小变化，最小 2 像素 */
export function pipSizeFor(size: number): number {
  return Math.max(2, Math.round(size * 0.19));
}

export function Die({ value, kind = 'lock', size = 16, className, label }: DieProps) {
  const { t } = useTranslation();
  const pips = pipsFor(value);
  const pipSize = pipSizeFor(size);
  const name = label ?? t(kind === 'lock' ? 'board.tower.heartLock' : 'die.combat', { n: value });
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      className={cn('ms-die', className)}
      data-kind={kind}
      data-empty={pips.length === 0 || undefined}
      style={{ width: size, height: size }}
    >
      {pips.map(([x, y]) => (
        <i
          key={`${x}-${y}`}
          className="ms-die-pip"
          style={{ left: `${x}%`, top: `${y}%`, width: pipSize, height: pipSize }}
        />
      ))}
    </span>
  );
}
