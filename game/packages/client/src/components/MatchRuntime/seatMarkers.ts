// 座位旁的状态标识：Bot / 掉线 / 托管 / 挂机托管

import type { SeatInfo } from '@icgame/game-engine';

export type SeatMarker = 'bot' | 'offline' | 'taken_over' | 'idle_takeover';

export function seatMarkers(info: SeatInfo | undefined): SeatMarker[] {
  if (!info) return [];
  const markers: SeatMarker[] = [];
  if (info.isBot) markers.push('bot');
  if (!info.isBot && !info.connected) markers.push('offline');
  if (!info.isBot && info.takenOver) {
    // 挂机托管单独区分文案：其他人看到的是「这人挂机了」，而不是「系统接管了掉线的人」
    markers.push(info.takeoverReason === 'idle' ? 'idle_takeover' : 'taken_over');
  }
  return markers;
}
