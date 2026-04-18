// WebSocket 消息类型定义（参照设计文档 §7.4.2 / §7.4.3）

// --- Client → Server ---
export type ClientMessage =
  | { type: 'update'; args: [string, number, unknown, string] }
  | { type: 'sync'; args: [string, string] }
  | { type: 'chat'; args: [string, ChatPayload] }
  | { type: 'icg:heartbeat'; at: number }
  | { type: 'icg:reconnect'; lastEventSeq: number }
  | { type: 'icg:ackIntent'; intentID: string }
  | { type: 'icg:spectateStart'; matchID: string }
  | { type: 'icg:chatBroadcast'; scope: ChatScope; message: string };

// --- Server → Client ---
export type ServerMessage =
  | { type: 'update'; args: [string, unknown, unknown[]] }
  | { type: 'sync'; args: [string, SyncInfo] }
  | { type: 'matchData'; args: [string, unknown] }
  | { type: 'icg:patch'; matchID: string; patch: unknown; eventSeq: number; serverTime: number }
  | { type: 'icg:event'; matchID: string; event: MatchEventPayload }
  | { type: 'icg:pendingResponse'; matchID: string; pendingResponse: unknown }
  | { type: 'icg:playerJoin'; matchID: string; player: PlayerJoinPayload }
  | { type: 'icg:playerLeave'; matchID: string; playerID: string; reason: LeaveReason }
  | { type: 'icg:aiTakeover'; matchID: string; playerID: string }
  | { type: 'icg:chatMessage'; matchID: string; message: ChatPayload }
  | { type: 'icg:error'; code: string; message: string };

// --- 子类型 ---
export type ChatScope = 'lobby' | 'room' | 'match' | 'spectator';
export type LeaveReason = 'disconnect' | 'voluntary' | 'kick' | 'timeout';

export interface ChatPayload {
  sender: string;
  text: string;
  phraseId?: string;
  sentAt: number;
}

export interface SyncInfo {
  state: unknown;
  log: unknown[];
  filtered: boolean;
}

export interface MatchEventPayload {
  moveCounter: number;
  eventKind: string;
  payload: unknown;
  timestamp: number;
}

export interface PlayerJoinPayload {
  playerID: string;
  nickname: string;
  seat: number;
}

// 心跳 Redis Key
export const WSKeys = {
  heartbeat: (matchId: string, playerId: string) => `ico:ws:hb:${matchId}:${playerId}`,
  eventSeq: (matchId: string) => `ico:ws:seq:${matchId}`,
  playerIntentAck: (matchId: string, playerId: string) => `ico:ws:ack:${matchId}:${playerId}`,
} as const;
