// 房间页的纯判断：本人是否在成员里、开局后该跳去哪

import { playersShortOfMinimum } from '@icgame/shared';
import type { RoomState } from '../../lib/roomApi';

/** 本人是否在房间成员里 */
export function isRoomMember(room: RoomState | null, playerId: string | null | undefined): boolean {
  if (!room || !playerId) return false;
  return room.players.some((p) => p.playerId === playerId);
}

/** 房间已开始且本人在成员里时返回要跳转的地址，否则返回 null */
export function resolveGameRedirect(
  room: RoomState | null,
  playerId: string | null | undefined,
  mockMode: boolean,
): string | null {
  if (!room || room.status !== 'playing' || !isRoomMember(room, playerId)) return null;
  if (mockMode) return `/game/${room.id}`;
  const params = new URLSearchParams({ online: '1', code: room.code });
  return `/game/${room.matchId ?? room.id}?${params.toString()}`;
}

/** 开始按钮的状态：人数够才可点；不够时给出还差几人 */
export function startGate(room: RoomState | null): { canStart: boolean; missing: number } {
  const missing = room ? playersShortOfMinimum(room.players.length) : 0;
  return { canStart: room !== null && missing === 0, missing };
}
