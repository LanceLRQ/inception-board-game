// 局后可举报的对象：这一局里除本人以外的真人座位
//
// Bot 座位没有账号，不能举报；被系统托管的真人座位仍是真人（挂机本身就是常见的举报理由）。

import type { SeatInfo } from '@icgame/game-engine';
import { avatarSeedOf } from '../../lib/avatarSeed';

export interface ReportTarget {
  readonly seat: string;
  readonly nickname: string;
  readonly avatarSeed: string;
}

export function reportTargets(seats: readonly SeatInfo[], mySeat: string | null): ReportTarget[] {
  if (mySeat === null) return [];
  return seats
    .filter((s) => !s.isBot && s.seat !== mySeat)
    .map((s) => ({ seat: s.seat, nickname: s.nickname, avatarSeed: avatarSeedOf(s) }));
}
