// 对局聊天记录：只在服务端留存，供运营审核举报时作佐证；不向客户端下发，也没有读取接口
//
// 广播已经发出之后才写，写入失败不影响对局（调用方负责吞掉并记 WARN）。

import type { PrismaClient } from '../generated/prisma/client.js';

export interface ChatLogEntry {
  matchID: string;
  /** 发送者账号 id；Bot 座位没有账号 */
  senderPlayerId: string | null;
  seat: number;
  phraseId: string;
  sentAt: Date;
  /** 广播范围；目前只有整局 */
  broadcastTo: 'all';
}

export interface ChatLog {
  record(entry: ChatLogEntry): Promise<void>;
}

/** 内存实现的容量上限：全内存开发服务与测试用，超出丢最旧的，避免常驻进程无限增长 */
const MEMORY_LIMIT = 10_000;

export class InMemoryChatLog implements ChatLog {
  private rows: ChatLogEntry[] = [];

  constructor(private readonly limit: number = MEMORY_LIMIT) {}

  async record(entry: ChatLogEntry): Promise<void> {
    this.rows.push({ ...entry });
    if (this.rows.length > this.limit) this.rows.splice(0, this.rows.length - this.limit);
  }

  entries(): ChatLogEntry[] {
    return this.rows.map((r) => ({ ...r }));
  }
}

/** PrismaChatLog 实际用到的最小接口，便于测试打桩 */
export interface PrismaChatLogClient {
  matchChatLog: Pick<PrismaClient['matchChatLog'], 'create'>;
}

export class PrismaChatLog implements ChatLog {
  constructor(private readonly prisma: PrismaChatLogClient) {}

  async record(entry: ChatLogEntry): Promise<void> {
    await this.prisma.matchChatLog.create({
      data: {
        matchId: entry.matchID,
        senderPlayerId: entry.senderPlayerId,
        senderSeat: entry.seat,
        phraseId: entry.phraseId,
        sentAt: entry.sentAt,
        broadcastTo: entry.broadcastTo,
      },
    });
  }
}
