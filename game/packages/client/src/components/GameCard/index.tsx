// 游戏卡牌组件 - 正面/背面/高亮/不可用/多尺寸/可选方向
// 对照：plans/design/06-frontend-design.md §6.4.2 / §6.4.3 / §6.17.8（ADR-042 失败降级）
//       plans/design/06c-match-table-layout.md §6.1（orientation + 长按 2000ms 统一）

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils.js';
import { cardFlip } from '../../styles/animations.js';
import { isPlaceholderMode } from '../../lib/assetsMode.js';
import { useCardPressDetail } from '../../hooks/useCardPressDetail.js';

export type GameCardSize = 'sm' | 'md' | 'lg';
export type GameCardOrientation = 'portrait' | 'landscape';

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
  /** 方向：portrait 竖向（默认，盗梦者/行动牌/梦魇/金库/贿赂/梦境层）；landscape 横向（梦主角色卡） */
  orientation?: GameCardOrientation;
  /** 点击回调（短按 / Enter） */
  onClick?: () => void;
  /** 长按 / 双击回调（查看详情）；不传则禁用 detail 行为 */
  onLongPress?: () => void;
  /** 显式禁用 detail（金库/梦境层卡传 true 即便 onLongPress 有值也不触发） */
  disableDetail?: boolean;
  /** 附加类名 */
  className?: string;
  /** 无障碍标签 */
  'aria-label'?: string;
}

// SIZE_MAP 二维化：外层 size，内层 orientation；landscape 是 portrait 的尺寸旋转 90°
// 导出供单测验证映射完整性与长宽对换
export const SIZE_MAP: Record<GameCardSize, Record<GameCardOrientation, string>> = {
  sm: {
    portrait: 'w-12 h-[68px]',
    landscape: 'w-[68px] h-12',
  },
  md: {
    portrait: 'w-20 h-[112px]',
    landscape: 'w-[112px] h-20',
  },
  lg: {
    portrait: 'w-24 h-[136px]',
    landscape: 'w-[136px] h-24',
  },
};

const SIZE_TEXT: Record<GameCardSize, string> = {
  sm: 'text-[8px]',
  md: 'text-xs',
  lg: 'text-sm',
};

export function GameCard({
  cardId,
  imageUrl,
  playable = true,
  selected = false,
  size = 'md',
  orientation = 'portrait',
  onClick,
  onLongPress,
  disableDetail,
  className,
  ...rest
}: GameCardProps) {
  const isBack = !cardId || cardId === '__back__';

  // 图片加载失败 → 降级占位（ADR-042 §6.17.8）
  const [imageFailed, setImageFailed] = useState(false);
  const handleImageError = useCallback(() => setImageFailed(true), []);
  const shouldShowImage = !isBack && imageUrl && !imageFailed && !isPlaceholderMode();

  // 长按/双击/键盘统一走 useCardPressDetail；onLongPress 未传时自动 disableDetail
  const detailDisabled = disableDetail ?? !onLongPress;
  const { handlers } = useCardPressDetail({
    onClick: playable ? onClick : undefined,
    onDetail: onLongPress,
    disableDetail: detailDisabled,
  });

  return (
    <motion.div
      className={cn(
        'relative flex-shrink-0 rounded-lg border-2 select-none touch-none overflow-hidden',
        'transition-shadow duration-200',
        SIZE_MAP[size][orientation],
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
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerLeave={handlers.onPointerLeave}
      onPointerCancel={handlers.onPointerCancel}
      onDoubleClick={handlers.onDoubleClick}
      onKeyDown={handlers.onKeyDown}
      onKeyUp={handlers.onKeyUp}
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
