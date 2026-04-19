// 游戏卡牌组件 - 正面/背面/高亮/不可用/多尺寸
// 对照：plans/design/06-frontend-design.md §6.4.2 / §6.4.3 / §6.17.8（ADR-042 失败降级）

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils.js';
import { cardFlip } from '../../styles/animations.js';
import { isPlaceholderMode } from '../../lib/assetsMode.js';

export type GameCardSize = 'sm' | 'md' | 'lg';

export interface GameCardProps {
  /** 卡牌 ID，用于确定卡面内容；null 或 '__back__' 显示背面 */
  cardId: string | null;
  /** 卡图 URL（若未提供或加载失败会走占位） */
  imageUrl?: string;
  /** 是否可打出（合法操作） */
  playable?: boolean;
  /** 是否选中态 */
  selected?: boolean;
  /** 尺寸 */
  size?: GameCardSize;
  /** 点击回调 */
  onClick?: () => void;
  /** 长按回调（查看详情） */
  onLongPress?: () => void;
  /** 附加类名 */
  className?: string;
  /** 无障碍标签 */
  'aria-label'?: string;
}

const SIZE_MAP: Record<GameCardSize, string> = {
  sm: 'w-12 h-[68px]',
  md: 'w-20 h-[112px]',
  lg: 'w-24 h-[136px]',
};

const SIZE_TEXT: Record<GameCardSize, string> = {
  sm: 'text-[8px]',
  md: 'text-xs',
  lg: 'text-sm',
};

// 长按阈值
const LONG_PRESS_MS = 500;

export function GameCard({
  cardId,
  imageUrl,
  playable = true,
  selected = false,
  size = 'md',
  onClick,
  onLongPress,
  className,
  ...rest
}: GameCardProps) {
  const isBack = !cardId || cardId === '__back__';

  // 长按检测
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  // 图片加载失败 → 降级占位（ADR-042 §6.17.8）
  const [imageFailed, setImageFailed] = useState(false);
  const handleImageError = useCallback(() => setImageFailed(true), []);
  const shouldShowImage = !isBack && imageUrl && !imageFailed && !isPlaceholderMode();

  const handlePointerDown = useCallback(() => {
    const timer = setTimeout(() => {
      onLongPress?.();
      setPressTimer(null);
    }, LONG_PRESS_MS);
    setPressTimer(timer);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
      onClick?.();
    }
  }, [pressTimer, onClick]);

  const handlePointerLeave = useCallback(() => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  }, [pressTimer]);

  return (
    <motion.div
      className={cn(
        'relative flex-shrink-0 rounded-lg border-2 select-none touch-none overflow-hidden',
        'transition-shadow duration-200',
        SIZE_MAP[size],
        selected
          ? 'border-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.5)] scale-105'
          : playable
            ? 'border-border hover:border-primary/60 hover:shadow-md'
            : 'border-border/40 opacity-50 cursor-not-allowed',
        className,
      )}
      style={{ perspective: '600px' }}
      variants={cardFlip}
      animate={isBack ? 'back' : 'front'}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      role={playable ? 'button' : undefined}
      tabIndex={playable ? 0 : -1}
      aria-label={rest['aria-label']}
      whileTap={playable ? { scale: 0.95 } : undefined}
    >
      {isBack ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-800 to-indigo-950">
          <span className="text-indigo-400/60 text-lg font-bold">ICO</span>
        </div>
      ) : shouldShowImage ? (
        <img
          src={imageUrl}
          alt={rest['aria-label'] ?? cardId}
          onError={handleImageError}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800 p-1">
          <span
            className={cn('text-center font-medium text-slate-200 leading-tight', SIZE_TEXT[size])}
          >
            {cardId!.replace(/^action_/, '').replace(/_/g, ' ')}
          </span>
        </div>
      )}
    </motion.div>
  );
}
