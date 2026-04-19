// ChatToast - 对局内聊天气泡（玩家发言后短暂展示）
// 对照：plans/design/06-frontend-design.md 预设短语气泡展示
//
// 设计：
//   - 每玩家独立一个气泡槽位（同玩家连发只显示最新）
//   - 3 秒后自动消失
//   - 位置由消费者传入（通常附在 PlayerBar 或头像旁）

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { findChatPreset } from '@icgame/shared';

export interface ChatToastProps {
  /** 最近一条消息（传 null 表示无） */
  readonly message: { readonly presetId: string; readonly sentAt: number } | null;
  /** 显示毫秒（默认 3000） */
  readonly durationMs?: number;
  /** 对齐方向：left（己方右下）/ right（对手左上） */
  readonly align?: 'left' | 'right';
}

export function ChatToast({ message, durationMs = 3_000, align = 'left' }: ChatToastProps) {
  const { t } = useTranslation();
  // 派生态：hiddenAt 记录"被主动隐藏的时间戳"，当 hiddenAt >= message.sentAt 时视为已消失
  const [hiddenAt, setHiddenAt] = useState<number>(0);

  useEffect(() => {
    if (!message) return;
    // 计时器回调里 setState 是允许的（不在 render 期间）
    const timer = setTimeout(() => setHiddenAt(message.sentAt), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);

  const preset = message ? findChatPreset(message.presetId) : null;
  const text = preset
    ? t(preset.i18nKey, { defaultValue: preset.textZh })
    : (message?.presetId ?? '');

  const visible = message !== null && hiddenAt < message.sentAt;

  return (
    <AnimatePresence>
      {visible && message ? (
        <motion.div
          key={message.sentAt}
          initial={{ opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          className={`inline-block max-w-[200px] rounded-2xl bg-card px-3 py-1.5 text-xs shadow-md ring-1 ring-border ${
            align === 'right' ? 'rounded-br-sm' : 'rounded-bl-sm'
          }`}
          role="status"
          aria-live="polite"
        >
          {text}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
