import { describe, expect, it } from 'vitest';
import { CHAT_HISTORY_LIMIT } from '@icgame/shared';
import {
  activeBubbles,
  appendChatEntry,
  NO_CHAT,
  parseIncomingChat,
  presetsForSeat,
  type ChatEntry,
} from './chat';

const entry = (id: number, seat: string, at: number, presetId = 'greet_hi'): ChatEntry => ({
  id,
  seat,
  presetId,
  at,
});

describe('parseIncomingChat', () => {
  const ok = {
    type: 'icg:chatMessage',
    matchID: 'm1',
    message: { sender: '2', phraseId: 'greet_hi' },
  };

  it('取出座位与短语 id', () => {
    expect(parseIncomingChat(ok)).toEqual({ seat: '2', presetId: 'greet_hi' });
  });

  it.each([
    ['不是对象', 'x'],
    ['null', null],
    ['没有 message', { type: 'icg:chatMessage' }],
    ['发送者不是字符串', { message: { sender: 2, phraseId: 'greet_hi' } }],
    ['发送者为空', { message: { sender: '', phraseId: 'greet_hi' } }],
    ['短语 id 不在预设里（不显示任意文本）', { message: { sender: '2', phraseId: 'free text' } }],
    ['没有短语 id', { message: { sender: '2', text: '大家好' } }],
  ])('忽略：%s', (_n, payload) => {
    expect(parseIncomingChat(payload)).toBeNull();
  });
});

describe('appendChatEntry', () => {
  it('追加到末尾', () => {
    expect(appendChatEntry([entry(1, '0', 0)], entry(2, '1', 1))).toHaveLength(2);
  });

  it('超过上限时丢掉最旧的', () => {
    let list: readonly ChatEntry[] = [];
    for (let i = 0; i < CHAT_HISTORY_LIMIT + 5; i++) list = appendChatEntry(list, entry(i, '0', i));
    expect(list).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(list[0]!.id).toBe(5);
  });
});

describe('activeBubbles', () => {
  it('每个座位只留最新的一条，过期的不显示', () => {
    const list = [entry(1, '0', 100), entry(2, '0', 200), entry(3, '1', 50)];
    const bubbles = activeBubbles(list, 300, 150);
    expect([...bubbles.keys()]).toEqual(['0']);
    expect(bubbles.get('0')!.id).toBe(2);
  });

  it('正好到点的算过期', () => {
    expect(activeBubbles([entry(1, '0', 100)], 250, 150).size).toBe(0);
    expect(activeBubbles([entry(1, '0', 100)], 249, 150).size).toBe(1);
  });

  it('没有消息是空表', () => {
    expect(activeBubbles([], 0, 100).size).toBe(0);
  });
});

describe('presetsForSeat', () => {
  it('梦主看不到盗梦者专用的战术短语，盗梦者看得到', () => {
    const master = presetsForSeat(true).map((p) => p.id);
    const thief = presetsForSeat(false).map((p) => p.id);
    expect(master).not.toContain('tactic_push');
    expect(thief).toContain('tactic_push');
    expect(master).toContain('greet_hi');
  });
});

describe('NO_CHAT', () => {
  it('没有连接的来源：不可用、没有消息、发送无效', () => {
    expect(NO_CHAT.available).toBe(false);
    expect(NO_CHAT.messages).toEqual([]);
    expect(NO_CHAT.send('greet_hi')).toBe(false);
  });
});
