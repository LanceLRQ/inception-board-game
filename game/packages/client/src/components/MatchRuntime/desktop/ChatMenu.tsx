// 片头条上的短语入口：点开浮层选一条预设短语；联机之外的来源不显示

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import type { MatchController } from '../controllerTypes';
import { ChatPhrasePanel } from '../shared/ChatPhrasePanel';

export function ChatMenu({ controller }: { readonly controller: MatchController }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { chat } = controller;
  if (!chat.available) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t('chat.toggle')}
        data-testid="chat-toggle"
        className="flex h-6 shrink-0 cursor-pointer items-center gap-1 border border-line-strong px-2 text-[10.5px] tracking-[.1em] text-dim hover:text-foreground"
      >
        <MessageCircle className="size-3" aria-hidden />
        {t('chat.toggle')}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        data-testid="chat-popover"
        className="max-h-[70dvh] w-80 overflow-y-auto"
      >
        <ChatPhrasePanel
          chat={chat}
          nicknameOf={controller.nicknameOf}
          selfSeat={controller.viewerSeat}
          onSent={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
