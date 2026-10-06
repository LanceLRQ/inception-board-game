// 远程来源：连接快照到对局来源的转换

import { describe, it, expect, vi } from 'vitest';
import type { MatchViewState, SeatInfo } from '@icgame/game-engine';
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
    ...patch,
  };
}

describe('toMatchSource', () => {
  it('字段原样带过来，kind 为 remote', () => {
    const source = toMatchSource(snap(), vi.fn());
    expect(source.kind).toBe('remote');
    expect(source.view).toBe(view);
    expect(source.seat).toBe('0');
    expect(source.seats).toBe(seats);
    expect(source.deadlineAt).toBe(123);
    expect(source.connection).toBe('connected');
    expect(source.error).toBeNull();
  });

  it('storageDegraded 原样带过来', () => {
    expect(toMatchSource(snap(), vi.fn()).storageDegraded).toBe(false);
    expect(toMatchSource(snap({ storageDegraded: true }), vi.fn()).storageDegraded).toBe(true);
  });

  it('fatal 映射为 match.fatal.<码>', () => {
    const source = toMatchSource(snap({ fatal: 'AUTH_INVALID', connection: 'failed' }), vi.fn());
    expect(source.error).toBe('match.fatal.AUTH_INVALID');
  });

  it('makeMove 转发给 sendMove', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const source = toMatchSource(snap(), send);
    await expect(source.makeMove('doDraw', [1])).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith('doDraw', [1]);
  });
});
