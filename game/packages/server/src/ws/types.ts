// WebSocket 消息类型：对局消息来自引擎包，这里补上心跳、聊天与通知类消息
// 聊天只传预设短语的 id（message 字段），不接受任意文本

import type { ClientMatchMessage, ServerMatchMessage } from '@icgame/game-engine';

// --- 客户端 → 服务端 ---
export type ClientMessage =
  | ClientMatchMessage
  | { type: 'icg:heartbeat'; at: number }
  | { type: 'icg:chatBroadcast'; scope: ChatScope; message: string };

// --- 服务端 → 客户端 ---
export type ServerMessage =
  | ServerMatchMessage
  | { type: 'icg:playerLeave'; matchID: string; playerID: string; reason: LeaveReason }
  | { type: 'icg:aiTakeover'; matchID: string; playerID: string }
  | { type: 'icg:chatMessage'; matchID: string; message: ChatPayload }
  | { type: 'icg:error'; code: string; message: string };

/**
 * 可以对整局广播同一份内容的消息。
 * 带对局状态或事件的消息（icg:state / icg:step / icg:moveResult）每个座位看到的不同，
 * 只能按连接单独发送，所以不在此列。
 */
export type BroadcastableMessage = Exclude<
  ServerMessage,
  { type: 'icg:state' | 'icg:step' | 'icg:moveResult' }
>;

// --- 子类型 ---
export type ChatScope = 'lobby' | 'room' | 'match' | 'spectator'; // 'spectator' 预留，观战未开放
export type LeaveReason = 'disconnect' | 'voluntary' | 'kick' | 'timeout';

export interface ChatPayload {
  sender: string;
  text: string;
  phraseId?: string;
  sentAt: number;
}

// 心跳 Redis Key
export const WSKeys = {
  heartbeat: (matchId: string, playerId: string) => `ico:ws:hb:${matchId}:${playerId}`,
} as const;
