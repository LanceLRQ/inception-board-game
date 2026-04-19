// ChatPanel - 预设短语抽屉面板（移动端友好）
// 对照：plans/design/06-frontend-design.md 预设短语面板 / plans/design/07-backend-network.md §7.9

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  CHAT_PRESETS,
  type ChatPresetCategory,
  type ChatPresetPhrase,
  type ChatPresetFaction,
  isPresetAvailableForFaction,
} from '@icgame/shared';
import { useChatCooldown } from '../../hooks/useChatCooldown';
import { cn } from '../../lib/utils';

export interface ChatPanelProps {
  /** 当前玩家阵营（控制可见预设） */
  readonly faction: ChatPresetFaction | string;
  /** 面板是否展开 */
  readonly open: boolean;
  /** 切换展开/收起 */
  readonly onToggle: (open: boolean) => void;
  /** 发送请求：返回值表示是否被服务端接受 */
  readonly onSend: (presetId: string) => void | Promise<void>;
  /** 冷却毫秒（默认 3000） */
  readonly cooldownMs?: number;
}

const CATEGORY_ORDER: ChatPresetCategory[] = ['greeting', 'tactic', 'emotion', 'feedback'];

export function ChatPanel({ faction, open, onToggle, onSend, cooldownMs = 3_000 }: ChatPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ChatPresetCategory>('greeting');
  const { state: cooldown, markSent } = useChatCooldown({ cooldownMs });

  const visiblePresets = useMemo(() => {
    return CHAT_PRESETS.filter((p) => isPresetAvailableForFaction(p, faction)).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
  }, [faction]);

  const tabPresets = useMemo(
    () => visiblePresets.filter((p) => p.category === activeTab),
    [visiblePresets, activeTab],
  );

  const handleSend = async (preset: ChatPresetPhrase) => {
    if (cooldown.isCoolingDown) return;
    markSent();
    try {
      await onSend(preset.id);
    } catch {
      // 忽略错误，让上层处理
    }
  };

  const remainingSec = Math.ceil(cooldown.remainingMs / 1000);

  return (
    <>
      {/* 底部触发按钮 */}
      <button
        type="button"
        onClick={() => onToggle(!open)}
        className={cn(
          'fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-lg',
          'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
        )}
        aria-label={t('chat.toggle', { defaultValue: '聊天' })}
        aria-expanded={open}
      >
        💬
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-label={t('chat.panel_title', { defaultValue: '预设短语' })}
            className="fixed bottom-0 left-0 right-0 z-40 max-h-[60vh] overflow-hidden rounded-t-2xl bg-background shadow-2xl"
          >
            {/* 顶部拖拽把手 */}
            <div className="flex justify-center py-2">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>

            {/* 分类 Tab */}
            <div className="flex gap-2 overflow-x-auto border-b border-border px-4 pb-2">
              {CATEGORY_ORDER.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveTab(cat)}
                  className={cn(
                    'whitespace-nowrap rounded-full px-3 py-1 text-sm transition-colors',
                    activeTab === cat
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  )}
                  aria-pressed={activeTab === cat}
                >
                  {t(`chat.category.${cat}`, { defaultValue: DEFAULT_CATEGORY_LABEL[cat] })}
                </button>
              ))}
            </div>

            {/* 短语按钮网格 */}
            <div className="grid grid-cols-2 gap-2 overflow-y-auto px-4 py-3">
              {tabPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSend(preset)}
                  disabled={cooldown.isCoolingDown}
                  className={cn(
                    'rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors',
                    cooldown.isCoolingDown
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:bg-accent hover:text-accent-foreground active:scale-95',
                  )}
                >
                  {t(preset.i18nKey, { defaultValue: preset.textZh })}
                </button>
              ))}
              {tabPresets.length === 0 ? (
                <div className="col-span-2 py-4 text-center text-sm text-muted-foreground">
                  {t('chat.no_presets', { defaultValue: '当前分类无可用短语' })}
                </div>
              ) : null}
            </div>

            {/* 冷却提示 */}
            {cooldown.isCoolingDown ? (
              <div className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
                {t('chat.cooldown', {
                  defaultValue: `冷却中...${remainingSec}s`,
                  seconds: remainingSec,
                })}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

const DEFAULT_CATEGORY_LABEL: Record<ChatPresetCategory, string> = {
  greeting: '问候',
  tactic: '战术',
  emotion: '情感',
  feedback: '反馈',
};
