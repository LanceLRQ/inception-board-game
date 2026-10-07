import { describe, it, expect, vi } from 'vitest';
import { InMemoryChatLog, PrismaChatLog, type ChatLogEntry } from './ChatLog.js';

const entry = (over: Partial<ChatLogEntry> = {}): ChatLogEntry => ({
  matchID: '11111111-1111-4111-8111-111111111111',
  senderPlayerId: '22222222-2222-4222-8222-222222222222',
  seat: 3,
  phraseId: 'greet_hi',
  sentAt: new Date(1_700_000_000_000),
  broadcastTo: 'all',
  ...over,
});

describe('InMemoryChatLog', () => {
  it('按顺序保存记录，读出的是副本', async () => {
    const log = new InMemoryChatLog();
    await log.record(entry({ seat: 1 }));
    await log.record(entry({ seat: 2 }));
    expect(log.entries().map((e) => e.seat)).toEqual([1, 2]);
    log.entries()[0]!.seat = 99;
    expect(log.entries()[0]!.seat).toBe(1);
  });

  it('超过上限时丢弃最旧的', async () => {
    const log = new InMemoryChatLog(2);
    for (const seat of [1, 2, 3]) await log.record(entry({ seat }));
    expect(log.entries().map((e) => e.seat)).toEqual([2, 3]);
  });
});

describe('PrismaChatLog', () => {
  it('写一行聊天记录：座位与账号、短语、时间、范围都带上', async () => {
    const create = vi.fn().mockResolvedValue({});
    await new PrismaChatLog({ matchChatLog: { create } } as never).record(entry());
    expect(create).toHaveBeenCalledWith({
      data: {
        matchId: '11111111-1111-4111-8111-111111111111',
        senderPlayerId: '22222222-2222-4222-8222-222222222222',
        senderSeat: 3,
        phraseId: 'greet_hi',
        sentAt: new Date(1_700_000_000_000),
        broadcastTo: 'all',
      },
    });
  });

  it('Bot 座位没有账号，账号列写空', async () => {
    const create = vi.fn().mockResolvedValue({});
    await new PrismaChatLog({ matchChatLog: { create } } as never).record(
      entry({ senderPlayerId: null }),
    );
    expect(create.mock.calls[0]![0].data.senderPlayerId).toBeNull();
  });

  it('数据库报错原样抛给调用方（由聊天服务决定怎么记日志）', async () => {
    const create = vi.fn().mockRejectedValue(new Error('fk'));
    await expect(
      new PrismaChatLog({ matchChatLog: { create } } as never).record(entry()),
    ).rejects.toThrow('fk');
  });
});
