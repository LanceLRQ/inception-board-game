// 入站聊天消息的形状校验：只收预设短语 id，不接受任意文本
//
// 短语 id 是否存在、此座位能不能发由 ChatService 判断；这里只保证形状：
// 载荷是对象、频道是对局、message 是长度受限的字符串。其余字段一律丢弃。

import type { ClientMessage } from './types.js';

export const CHAT_BROADCAST_EVENT = 'icg:chatBroadcast';
/** 短语 id 的长度上限；预设里最长的 id 远小于它，超出的一定不是合法 id */
export const CHAT_MESSAGE_ID_MAX_LENGTH = 64;

type ChatBroadcastMessage = Extract<ClientMessage, { type: 'icg:chatBroadcast' }>;

export function parseChatBroadcast(event: string, payload: unknown): ChatBroadcastMessage | null {
  if (event !== CHAT_BROADCAST_EVENT) return null;
  try {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    if ('type' in record && record.type !== CHAT_BROADCAST_EVENT) return null;
    if (record.scope !== 'match') return null;
    const message = record.message;
    if (typeof message !== 'string') return null;
    if (message.length < 1 || message.length > CHAT_MESSAGE_ID_MAX_LENGTH) return null;
    return { type: CHAT_BROADCAST_EVENT, scope: 'match', message };
  } catch {
    return null;
  }
}
