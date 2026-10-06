// 预设短语面板：分类标签 + 短语按钮 + 可展开的最近消息；桌面的浮层与移动的底部抽屉共用
// 只能选预设里的短语，没有输入框。发送后进入冷却（按钮禁用并显示剩余秒数）。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { findChatPreset, type ChatPresetCategory } from '@icgame/shared';
import { cn } from '../../../lib/utils';
import type { ChatModel } from '../controllerTypes';

const CATEGORY_ORDER: readonly ChatPresetCategory[] = ['greeting', 'tactic', 'emotion', 'feedback'];
/** 最近消息列表里最多显示几条（新的在下） */
const RECENT_LIMIT = 8;

interface ChatPhrasePanelProps {
  readonly chat: ChatModel;
  readonly nicknameOf: (seat: string) => string;
  readonly selfSeat: string;
  /** 选了短语并发出之后（供浮层 / 抽屉收起） */
  readonly onSent?: () => void;
}

export function ChatPhrasePanel({ chat, nicknameOf, selfSeat, onSent }: ChatPhrasePanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ChatPresetCategory>('greeting');
  const [recentOpen, setRecentOpen] = useState(false);
  const cooling = chat.cooldownSeconds > 0;
  const tabs = CATEGORY_ORDER.filter((c) => chat.presets.some((p) => p.category === c));
  const activeTab = tabs.includes(tab) ? tab : (tabs[0] ?? 'greeting');
  const recent = chat.messages.slice(-RECENT_LIMIT);

  return (
    <div className="flex min-w-0 flex-col gap-2.5" data-testid="chat-panel">
      <div className="border border-line">
        <button
          type="button"
          onClick={() => setRecentOpen((v) => !v)}
          aria-expanded={recentOpen}
          data-testid="chat-recent-toggle"
          className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 px-3 text-left text-xs text-dim"
        >
          <span>{t('chat.recent', { n: chat.messages.length })}</span>
          <ChevronDown
            className={cn('size-4 transition-transform', recentOpen && 'rotate-180')}
            aria-hidden
          />
        </button>
        {recentOpen && (
          <ul
            className="max-h-32 overflow-y-auto border-t border-line px-3 py-1.5 text-[12px]"
            data-testid="chat-recent"
          >
            {recent.length === 0 ? (
              <li className="py-1 text-faint">{t('chat.recentEmpty')}</li>
            ) : (
              recent.map((m) => {
                const preset = findChatPreset(m.presetId);
                if (!preset) return null;
                return (
                  <li key={m.id} className="flex gap-1.5 py-0.5">
                    <b
                      className={cn(
                        'shrink-0',
                        m.seat === selfSeat ? 'text-acc-bright' : 'text-dim',
                      )}
                    >
                      {m.seat === selfSeat ? t('seat.me') : nicknameOf(m.seat)}
                    </b>
                    <span className="min-w-0 break-words text-foreground">{t(preset.i18nKey)}</span>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label={t('chat.categories')}>
        {tabs.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setTab(c)}
            aria-pressed={activeTab === c}
            data-testid={`chat-tab-${c}`}
            className={cn(
              'min-h-11 shrink-0 touch-manipulation border px-3 text-xs whitespace-nowrap',
              activeTab === c
                ? 'border-acc bg-acc-soft text-acc-bright'
                : 'border-line-strong text-dim',
            )}
          >
            {t(`chat.category.${c}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {chat.presets
          .filter((p) => p.category === activeTab)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={cooling}
              onClick={() => {
                chat.send(p.id);
                onSent?.();
              }}
              data-testid={`chat-phrase-${p.id}`}
              className="min-h-11 touch-manipulation border border-line-strong bg-panel-2 px-2 py-1.5 text-left text-[13px] leading-snug text-foreground active:translate-y-px disabled:opacity-45"
            >
              {t(p.i18nKey)}
            </button>
          ))}
      </div>

      <p
        className="h-4 text-center text-[11px] text-dim"
        aria-live="polite"
        data-testid="chat-cooldown"
      >
        {cooling ? t('chat.cooldown', { seconds: chat.cooldownSeconds }) : ''}
      </p>
    </div>
  );
}
