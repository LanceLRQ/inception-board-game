// 行动轴头像旁的短语气泡
// 行动轴自己是 overflow 滚动容器，气泡放进去会被裁掉，所以用固定定位浮在头像右侧：
// 气泡出现时按头像此刻在屏幕上的位置计算一次，几秒后随气泡一起消失。

import { useEffect, useState } from 'react';
import type { ChatEntry } from '../../../match/chat';
import { ChatBubble } from '../shared/ChatBubble';

interface BubbleSpot {
  readonly left: number;
  readonly top: number;
  readonly maxWidth: number;
}

/** 屏幕右侧留给气泡的最小宽度，放不下时就不显示（极窄屏的退化情况） */
const MIN_WIDTH = 72;
const GAP = 8;
const SCREEN_MARGIN = 12;

function locate(seat: string): BubbleSpot | null {
  const avatar = document.querySelector(`[data-testid="player-avatar-${CSS.escape(seat)}"]`);
  if (!avatar) return null;
  const rect = avatar.getBoundingClientRect();
  const left = rect.right + GAP;
  const maxWidth = Math.min(176, window.innerWidth - left - SCREEN_MARGIN);
  if (maxWidth < MIN_WIDTH) return null;
  return { left, top: rect.top + rect.height / 2 - 14, maxWidth };
}

export function RailBubbles({ bubbles }: { readonly bubbles: ReadonlyMap<string, ChatEntry> }) {
  const [spots, setSpots] = useState<Readonly<Record<string, BubbleSpot>>>({});

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const next: Record<string, BubbleSpot> = {};
      for (const seat of bubbles.keys()) {
        const spot = locate(seat);
        if (spot) next[seat] = spot;
      }
      setSpots(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [bubbles]);

  return (
    <>
      {[...bubbles.entries()].map(([seat, entry]) => {
        const spot = spots[seat];
        if (!spot) return null;
        return (
          <ChatBubble
            key={seat}
            entry={entry}
            seatId={seat}
            side="left"
            className="fixed"
            style={{ left: spot.left, top: spot.top, maxWidth: spot.maxWidth }}
          />
        );
      })}
    </>
  );
}
