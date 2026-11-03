import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { MatchController } from '../controllerTypes';
import { DesktopDock } from '../desktop/DesktopDock';
import { GameGuide } from '../../GameGuide';
import { ChatSheet } from './ChatSheet';

export function MobileDock({ controller }: { controller: MatchController }) {
  const [chatOpen, setChatOpen] = useState(false);
  return (
    <>
      <DesktopDock
        controller={controller}
        tools={
          <>
            <GameGuide />
            {controller.chat.available && (
              <button type="button" aria-label="聊天" onClick={() => setChatOpen(true)}>
                <MessageCircle size={18} />
              </button>
            )}
          </>
        }
      />
      <ChatSheet open={chatOpen} onOpenChange={setChatOpen} controller={controller} />
    </>
  );
}
