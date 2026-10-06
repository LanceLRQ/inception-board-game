// 对局内预设短语的控制层：冷却、可选短语、座位气泡
//
// 通道本身（收发、历史）由对局来源提供；这里只加界面需要的派生：3 秒冷却（服务端另有一道，
// 以服务端为准）、按座位阵营过滤的短语、此刻还在显示的气泡。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CHAT_BUBBLE_VISIBLE_MS, CHAT_COOLDOWN_MS } from '@icgame/shared';
import { monotonicNow } from '../../lib/deadlineClock';
import { useChatCooldown } from '../../hooks/useChatCooldown';
import { activeBubbles, presetsForSeat, type ChatChannel } from '../../match/chat';
import type { ChatModel } from './controllerTypes';

/** 有新消息后每 500 毫秒刷新一次时钟，直到最新一条的气泡过期；平时不起定时器 */
function useBubbleClock(latestAt: number | null): number {
  const [now, setNow] = useState(() => monotonicNow());
  useEffect(() => {
    if (latestAt === null) return;
    queueMicrotask(() => setNow(monotonicNow()));
    const id = setInterval(() => {
      const current = monotonicNow();
      setNow(current);
      // 用同一个读数判断与刷新，保证最后一次刷新时气泡已经算作过期
      if (current - latestAt >= CHAT_BUBBLE_VISIBLE_MS) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [latestAt]);
  return now;
}

export function useMatchChat(channel: ChatChannel, isMasterSeat: boolean): ChatModel {
  const { state: cooldown, markSent } = useChatCooldown({ cooldownMs: CHAT_COOLDOWN_MS });
  const latestAt = channel.messages.at(-1)?.at ?? null;
  const now = useBubbleClock(latestAt);
  const bubbles = useMemo(
    () => activeBubbles(channel.messages, now, CHAT_BUBBLE_VISIBLE_MS),
    [channel.messages, now],
  );
  const presets = useMemo(() => presetsForSeat(isMasterSeat), [isMasterSeat]);

  const { send: channelSend } = channel;
  const send = useCallback(
    (presetId: string) => {
      if (cooldown.isCoolingDown) return;
      if (channelSend(presetId)) markSent();
    },
    [cooldown.isCoolingDown, channelSend, markSent],
  );

  return {
    available: channel.available,
    presets,
    messages: channel.messages,
    bubbles,
    cooldownSeconds: Math.ceil(cooldown.remainingMs / 1000),
    send,
  };
}
