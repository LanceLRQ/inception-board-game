// 手牌坞上的短语抽屉：从底部升起，选一条预设短语后自动收起

import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../ui/sheet';
import type { MatchController } from '../controllerTypes';
import { ChatPhrasePanel } from '../shared/ChatPhrasePanel';

interface ChatSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly controller: MatchController;
}

export function ChatSheet({ open, onOpenChange, controller }: ChatSheetProps) {
  const { t } = useTranslation();
  const { chat } = controller;
  return (
    <Sheet open={open && chat.available} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-testid="chat-sheet"
        className="max-h-[80dvh] overflow-y-auto pb-safe"
      >
        <SheetHeader>
          <SheetTitle>{t('chat.title')}</SheetTitle>
          <SheetDescription>{t('chat.desc')}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <ChatPhrasePanel
            chat={chat}
            nicknameOf={controller.nicknameOf}
            selfSeat={controller.viewerSeat}
            onSent={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
