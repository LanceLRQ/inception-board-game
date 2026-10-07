// 远程来源：连接快照到对局来源的转换

import { describe, it, expect, vi } from 'vitest';
import type { MatchViewState, SeatInfo } from '@icgame/game-engine';
import zhCN from '../i18n/locales/zh-CN.json';
import en from '../i18n/locales/en.json';
import { toMatchSource } from './useRemoteMatchSource';
import type { MatchSocketSnapshot } from './matchSocket';

const view = { stateID: 4 } as unknown as MatchViewState;
const seats: SeatInfo[] = [
  { seat: '0', nickname: 'a', isBot: false, connected: true, takenOver: false },
];

function snap(patch: Partial<MatchSocketSnapshot> = {}): MatchSocketSnapshot {
  return {
    view,
    seat: '0',
    seats,
    deadlineAt: 123,
    connection: 'connected',
    storageDegraded: false,
    fatal: null,
    chat: [],
    ...patch,
  };
}

describe('toMatchSource', () => {
  it('字段原样带过来，kind 为 remote', () => {
    const source = toMatchSource(snap(), vi.fn(), vi.fn());
    expect(source.kind).toBe('remote');
    expect(source.view).toBe(view);
    expect(source.seat).toBe('0');
    expect(source.seats).toBe(seats);
    expect(source.deadlineAt).toBe(123);
    expect(source.connection).toBe('connected');
    expect(source.error).toBeNull();
  });

  it('聊天通道：消息来自快照，send 转发给 sendChat，联机来源可用', () => {
    const sendChat = vi.fn().mockReturnValue(true);
    const messages = [{ id: 1, seat: '0', presetId: 'greet_hi', at: 1 }];
    const source = toMatchSource(snap({ chat: messages }), vi.fn(), vi.fn(), sendChat);
    expect(source.chat.available).toBe(true);
    expect(source.chat.messages).toBe(messages);
    expect(source.chat.send('greet_hi')).toBe(true);
    expect(sendChat).toHaveBeenCalledWith('greet_hi');
  });

  it('聊天通道：没连上时不可用', () => {
    expect(
      toMatchSource(snap({ connection: 'reconnecting' }), vi.fn(), vi.fn()).chat.available,
    ).toBe(false);
  });

  it('举报通道原样带过来；不给就是 null', () => {
    const report = { submit: vi.fn() };
    expect(toMatchSource(snap(), vi.fn(), vi.fn(), vi.fn(), report).report).toBe(report);
    expect(toMatchSource(snap(), vi.fn(), vi.fn()).report).toBeNull();
  });

  it('storageDegraded 原样带过来', () => {
    expect(toMatchSource(snap(), vi.fn(), vi.fn()).storageDegraded).toBe(false);
    expect(toMatchSource(snap({ storageDegraded: true }), vi.fn(), vi.fn()).storageDegraded).toBe(
      true,
    );
  });

  it('fatal 映射为 match.fatal.<码>', () => {
    const source = toMatchSource(
      snap({ fatal: 'AUTH_INVALID', connection: 'failed' }),
      vi.fn(),
      vi.fn(),
    );
    expect(source.error).toBe('match.fatal.AUTH_INVALID');
  });

  it('账号被封禁：映射为 match.fatal.BANNED，中英文案都有', () => {
    const source = toMatchSource(snap({ fatal: 'BANNED', connection: 'failed' }), vi.fn(), vi.fn());
    expect(source.error).toBe('match.fatal.BANNED');
    expect(zhCN.match.fatal.BANNED).toBeTruthy();
    expect(en.match.fatal.BANNED).toBeTruthy();
  });

  it('makeMove 转发给 sendMove', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const source = toMatchSource(snap(), send, vi.fn());
    await expect(source.makeMove('doDraw', [1])).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith('doDraw', [1]);
  });

  describe('托管状态', () => {
    const takenSeats = (reason: 'idle' | 'disconnected'): SeatInfo[] => [
      { ...seats[0]!, takenOver: true, takeoverReason: reason },
      { seat: '1', nickname: 'b', isBot: false, connected: true, takenOver: false },
    ];

    it('本人座位未托管时 selfTakenOver 为 false', () => {
      expect(toMatchSource(snap(), vi.fn(), vi.fn()).selfTakenOver).toBe(false);
    });

    it('本人座位被托管时 selfTakenOver 为 true，别人被托管不算', () => {
      expect(
        toMatchSource(snap({ seats: takenSeats('idle') }), vi.fn(), vi.fn()).selfTakenOver,
      ).toBe(true);
      expect(
        toMatchSource(snap({ seats: takenSeats('idle'), seat: '1' }), vi.fn(), vi.fn())
          .selfTakenOver,
      ).toBe(false);
    });

    it('座位尚未就绪（seat 为 null）时 selfTakenOver 为 false', () => {
      expect(
        toMatchSource(snap({ seats: takenSeats('idle'), seat: null }), vi.fn(), vi.fn())
          .selfTakenOver,
      ).toBe(false);
    });

    it('resume 转发给连接', () => {
      const resume = vi.fn();
      toMatchSource(snap(), vi.fn(), resume).resume();
      expect(resume).toHaveBeenCalledTimes(1);
    });
  });
});
