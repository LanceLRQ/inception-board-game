import { describe, expect, it } from 'vitest';
import type { SeatInfo } from '@icgame/game-engine';
import { reportTargets } from './reportTargets';

const seat = (n: string, over: Partial<SeatInfo> = {}): SeatInfo => ({
  seat: n,
  nickname: `P${n}`,
  isBot: false,
  connected: true,
  takenOver: false,
  ...over,
});

describe('reportTargets', () => {
  it('不含本人与 Bot，被托管的真人仍可举报', () => {
    const seats = [
      seat('0'),
      seat('1', { isBot: true }),
      seat('2', { takenOver: true, connected: false }),
      seat('3', { avatarSeed: 'srv' }),
    ];
    expect(reportTargets(seats, '0')).toEqual([
      { seat: '2', nickname: 'P2', avatarSeed: 'seat-2-P2' },
      { seat: '3', nickname: 'P3', avatarSeed: 'srv' },
    ]);
  });

  it('不知道本人座位时没有目标；全是 Bot 对手时没有目标', () => {
    expect(reportTargets([seat('0'), seat('1')], null)).toEqual([]);
    expect(reportTargets([seat('0'), seat('1', { isBot: true })], '0')).toEqual([]);
  });
});
