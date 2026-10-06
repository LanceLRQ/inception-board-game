// 座位标识的取舍

import { describe, it, expect } from 'vitest';
import type { SeatInfo } from '@icgame/game-engine';
import { seatMarkers, markersBySeat } from './seatMarkers';

const base: SeatInfo = {
  seat: '1',
  nickname: 'x',
  isBot: false,
  connected: true,
  takenOver: false,
};

describe('seatMarkers', () => {
  it('在线真人没有标识', () => {
    expect(seatMarkers(base)).toEqual([]);
  });

  it('Bot 显示 bot', () => {
    expect(seatMarkers({ ...base, isBot: true })).toEqual(['bot']);
  });

  it('掉线真人显示 offline', () => {
    expect(seatMarkers({ ...base, connected: false })).toEqual(['offline']);
  });

  it('被托管的真人显示 taken_over（同时掉线则两者都有）', () => {
    expect(seatMarkers({ ...base, takenOver: true })).toEqual(['taken_over']);
    expect(seatMarkers({ ...base, connected: false, takenOver: true })).toEqual([
      'offline',
      'taken_over',
    ]);
  });

  it('因挂机被托管的真人显示 idle_takeover，替代通用的 taken_over', () => {
    expect(seatMarkers({ ...base, takenOver: true, takeoverReason: 'idle' })).toEqual([
      'idle_takeover',
    ]);
    expect(seatMarkers({ ...base, takenOver: true, takeoverReason: 'disconnected' })).toEqual([
      'taken_over',
    ]);
  });

  it('座位表里没有该座位时没有标识', () => {
    expect(seatMarkers(undefined)).toEqual([]);
  });
});

describe('markersBySeat', () => {
  it('空座位表得到空对象', () => {
    expect(markersBySeat([])).toEqual({});
  });

  it('全部在线真人的座位表得到空对象', () => {
    expect(markersBySeat([base, { ...base, seat: '2' }])).toEqual({});
  });

  it('按座位聚合标识，没有标识的座位不出现', () => {
    const result = markersBySeat([
      { ...base, seat: '0' },
      { ...base, seat: '1', isBot: true },
      { ...base, seat: '2', connected: false },
      { ...base, seat: '3', connected: false, takenOver: true },
      { ...base, seat: '4', takenOver: true, takeoverReason: 'idle' },
    ]);
    expect(result).toEqual({
      '1': ['bot'],
      '2': ['offline'],
      '3': ['offline', 'taken_over'],
      '4': ['idle_takeover'],
    });
    expect('0' in result).toBe(false);
  });
});
