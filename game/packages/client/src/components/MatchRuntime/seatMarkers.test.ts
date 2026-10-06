// 座位标识的取舍

import { describe, it, expect } from 'vitest';
import type { SeatInfo } from '@icgame/game-engine';
import { seatMarkers } from './seatMarkers';

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
