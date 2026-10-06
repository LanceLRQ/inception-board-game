// 座位旁的预设短语气泡：文字按 i18n 渲染，只显示预设里的短语（不会出现任意文本）
// 过渡用 framer-motion，用户选了「减少动效」时由 MotionConfig 统一取消飞入。
// 样式钩子类名：ms-bubble（data-side = bottom | left）。

import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { findChatPreset } from '@icgame/shared';
import type { ChatEntry } from '../../../match/chat';
import { cn } from '../../../lib/utils';

interface ChatBubbleProps {
  readonly entry: ChatEntry | undefined;
  readonly seatId: string;
  /** 尖角方向：bottom 朝下（本人坞上方）、top 朝上、left 朝左（气泡在右侧）、right 朝右（气泡在左侧） */
  readonly side: 'bottom' | 'top' | 'left' | 'right';
  readonly className?: string;
  readonly style?: React.CSSProperties;
}

/** 飞入的起点偏移：从尖角指向的那一侧滑进来 */
const ENTER_OFFSET: Record<ChatBubbleProps['side'], { x: number; y: number }> = {
  bottom: { x: 0, y: 6 },
  top: { x: 0, y: -6 },
  left: { x: -6, y: 0 },
  right: { x: 6, y: 0 },
};

export function ChatBubble({ entry, seatId, side, className, style }: ChatBubbleProps) {
  const { t } = useTranslation();
  const preset = entry ? findChatPreset(entry.presetId) : null;
  // 外层只负责定位（framer-motion 会接管内层的 transform，所以定位用的 transform 不能放在动画元素上）
  return (
    <div className={cn('pointer-events-none z-30 w-max', className)} style={style}>
      <AnimatePresence>
        {entry && preset && (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, ...ENTER_OFFSET[side] }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            role="status"
            data-testid={`chat-bubble-${seatId}`}
            data-phrase={entry.presetId}
            data-side={side}
            className="ms-bubble w-max max-w-44 px-2.5 py-1.5 text-[12px] leading-snug"
            style={{ maxWidth: style?.maxWidth }}
          >
            {t(preset.i18nKey)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
