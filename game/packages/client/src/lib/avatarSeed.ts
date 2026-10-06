// 像素头像种子的取值：座位表里的种子（公开信息）优先，没有就由座位与昵称推导一个稳定的

import type { SeatInfo } from '@icgame/game-engine';

type SeatLike = Pick<SeatInfo, 'seat' | 'nickname' | 'avatarSeed'>;

/**
 * 某个座位用的头像种子。Bot 与本地来源的座位没有账号，推导出的种子同一座位同一昵称恒定，
 * 刷新页面、重连后头像不变。
 */
export function avatarSeedOf(info: SeatLike | undefined, seat?: string): string {
  if (info?.avatarSeed) return info.avatarSeed;
  if (info) return `seat-${info.seat}-${info.nickname}`;
  return `seat-${seat ?? '?'}`;
}

/** 本地来源的座位表没有头像种子：给本人座位补上身份里的那一个，其余仍由座位推导 */
export function withSelfAvatar(
  seats: readonly SeatInfo[],
  selfSeat: string | null,
  selfAvatarSeed: string,
): readonly SeatInfo[] {
  if (selfSeat === null || selfAvatarSeed === '') return seats;
  const self = seats.find((s) => s.seat === selfSeat);
  if (!self || self.avatarSeed) return seats;
  return seats.map((s) => (s.seat === selfSeat ? { ...s, avatarSeed: selfAvatarSeed } : s));
}
