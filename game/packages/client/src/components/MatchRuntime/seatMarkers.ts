// 座位旁的状态标识：Bot / 掉线 / 托管

import type { SeatInfo } from '@icgame/game-engine';

export type SeatMarker = 'bot' | 'offline' | 'taken_over';

export function seatMarkers(info: SeatInfo | undefined): SeatMarker[] {
  if (!info) return [];
  const markers: SeatMarker[] = [];
  if (info.isBot) markers.push('bot');
  if (!info.isBot && !info.connected) markers.push('offline');
  if (!info.isBot && info.takenOver) markers.push('taken_over');
  return markers;
}
