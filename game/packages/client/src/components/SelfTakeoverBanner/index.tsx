// SelfTakeoverBanner - 本人座位被托管时的提示条
//
// 放在对局界面顶部的正常文档流里并吸顶：不覆盖手牌与操作栏，滚动时也始终点得到。
// 取消托管只是发一次请求，结果以服务端随后下发的座位表为准，座位解除托管后本条自动消失。

import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface SelfTakeoverBannerProps {
  readonly visible: boolean;
  readonly onResume: () => void;
}

export function SelfTakeoverBanner({ visible, onResume }: SelfTakeoverBannerProps) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="self-takeover-banner"
      className="sticky top-0 z-40 mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-acc/60 bg-primary/95 px-3 py-2 text-sm font-medium text-primary-foreground shadow-md"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Bot className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          {t('match.self_takeover.message', {
            defaultValue: '你已被托管，Bot 正在替你行动',
          })}
        </span>
      </span>
      <button
        type="button"
        onClick={onResume}
        data-testid="self-takeover-resume"
        className="shrink-0 rounded bg-background px-3 py-1 text-foreground hover:bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background"
      >
        {t('match.self_takeover.resume', { defaultValue: '取消托管' })}
      </button>
    </div>
  );
}
