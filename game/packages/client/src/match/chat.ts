// 对局内预设短语：消息的形状、历史列表与座位气泡的纯逻辑
//
// 只有预设短语的 id 在网络上流动，文字由界面按 i18n 渲染；收到的 id 不在预设里就忽略，
// 所以界面永远不会显示任何由别人输入的文本。

import {
  CHAT_HISTORY_LIMIT,
  CHAT_PRESETS,
  isPresetAvailableForFaction,
  isValidChatPresetId,
  type ChatPresetPhrase,
} from '@icgame/shared';

export interface ChatEntry {
  /** 本连接内递增，列表渲染用 */
  readonly id: number;
  /** 发送者座位 */
  readonly seat: string;
  readonly presetId: string;
  /** 收到的时刻，本机单调时钟（performance.now）的毫秒；气泡的显示与过期都按它算，不受本机日历时间影响 */
  readonly at: number;
}

/** 来源提供的聊天通道；没有连接的来源（本地人机、固定场景）不可用 */
export interface ChatChannel {
  readonly available: boolean;
  /** 最近的消息，旧的在前 */
  readonly messages: readonly ChatEntry[];
  /** 发送一条预设短语；返回是否真的发出了（未连接、id 不在预设里时为 false） */
  send(presetId: string): boolean;
}

export const NO_CHAT: ChatChannel = {
  available: false,
  messages: [],
  send: () => false,
};

/** 解析服务端的 icg:chatMessage：只取座位与预设 id，其余字段（包括服务端附带的文案）一律不用 */
export function parseIncomingChat(msg: unknown): { seat: string; presetId: string } | null {
  if (msg === null || typeof msg !== 'object') return null;
  const message = (msg as { message?: unknown }).message;
  if (message === null || typeof message !== 'object') return null;
  const { sender, phraseId } = message as { sender?: unknown; phraseId?: unknown };
  if (typeof sender !== 'string' || sender === '') return null;
  if (typeof phraseId !== 'string' || !isValidChatPresetId(phraseId)) return null;
  return { seat: sender, presetId: phraseId };
}

export function appendChatEntry(
  list: readonly ChatEntry[],
  next: ChatEntry,
  limit: number = CHAT_HISTORY_LIMIT,
): ChatEntry[] {
  const merged = [...list, next];
  return merged.length > limit ? merged.slice(merged.length - limit) : merged;
}

/** 此刻还在显示的气泡：每个座位最新的一条，到点即过期 */
export function activeBubbles(
  messages: readonly ChatEntry[],
  now: number,
  visibleMs: number,
): ReadonlyMap<string, ChatEntry> {
  const out = new Map<string, ChatEntry>();
  for (const m of messages) {
    if (now - m.at >= visibleMs) continue;
    const prev = out.get(m.seat);
    if (!prev || m.id > prev.id) out.set(m.seat, m);
  }
  return out;
}

/**
 * 面板里能选的短语。阵营只按「是不是梦主座位」区分（梦主座位是公开的），
 * 与服务端的判断一致，不涉及个人的真实阵营。
 */
export function presetsForSeat(isMaster: boolean): readonly ChatPresetPhrase[] {
  const faction = isMaster ? 'master' : 'thief';
  return CHAT_PRESETS.filter((p) => isPresetAvailableForFaction(p, faction)).sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
}
