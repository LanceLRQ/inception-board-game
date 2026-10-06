// SeatStatusBadges - 座位状态标识（Bot / 掉线 / 系统托管 / 挂机托管）
//
// 舞台座位（PC 围坐 / 移动行动轴）与折叠座位清单共用；
// 「人不在」类标识（掉线、托管、挂机）用醒目色，Bot 保持弱化。

import { Bot, UserCog, WifiOff, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';
import type { SeatMarker } from '../MatchRuntime/seatMarkers.js';

export interface SeatStatusBadgesProps {
  markers: readonly SeatMarker[];
  seatId: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** 标识 → 图标 */
export const MARKER_ICON: Record<SeatMarker, LucideIcon> = {
  bot: Bot,
  offline: WifiOff,
  taken_over: UserCog,
  idle_takeover: UserCog,
};

/** 标识 → 语义色类名 */
export const MARKER_COLOR_CLASS: Record<SeatMarker, string> = {
  bot: 'text-muted-foreground',
  offline: 'text-destructive',
  taken_over: 'text-amber-500',
  idle_takeover: 'text-amber-500',
};

const SIZE_CLASS = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
} as const;

export function SeatStatusBadges({
  markers,
  seatId,
  size = 'md',
  className,
}: SeatStatusBadgesProps) {
  const { t } = useTranslation();
  if (markers.length === 0) return null;

  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      data-testid={`seat-status-${seatId}`}
    >
      {markers.map((marker) => {
        const Icon = MARKER_ICON[marker];
        const label = t(`match.seat.${marker}`);
        return (
          <Icon
            key={marker}
            className={cn(SIZE_CLASS[size], MARKER_COLOR_CLASS[marker])}
            role="img"
            aria-label={label}
            data-testid={`seat-marker-${marker}-${seatId}`}
          >
            <title>{label}</title>
          </Icon>
        );
      })}
    </span>
  );
}
