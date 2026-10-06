// 房间的查询与写操作：缓存键、进入房间的逻辑、轮询节奏

import { ApiRequestError } from './api';
import { roomApi, type IdentityInfo, type RoomState } from './roomApi';
import type { RoomPushStatus } from './roomSocket';

/** 查询缓存键；房间码统一成大写 */
export const roomKeys = {
  detail: (code: string) => ['room', code.toUpperCase()] as const,
};

/** 推送不可用时退回轮询的间隔（毫秒）：远比原先的 3 秒长，只作兜底 */
export const ROOM_FALLBACK_POLL_MS = 15_000;

/**
 * 房间的轮询间隔：推送连着时不轮询；页面不可见时暂停（回到前台由页面立即补取一次）；
 * 其余情况（未连上、断线、推送被拒）每 15 秒取一次。
 */
export function roomPollInterval(pushStatus: RoomPushStatus, pageVisible: boolean): number | false {
  if (!pageVisible) return false;
  return pushStatus === 'connected' ? false : ROOM_FALLBACK_POLL_MS;
}

/**
 * 进入房间：先加入。已在房间里的人刷新页面可能因「游戏已开始」等原因加入失败，
 * 此时若查得到房间且本人在成员里，就按已加入处理；否则抛出加入时的错误。
 */
export async function joinOrAttach(code: string, me: IdentityInfo): Promise<RoomState> {
  try {
    return await roomApi.joinRoom(code, me);
  } catch (joinError) {
    try {
      const existing = await roomApi.getRoom(code);
      if (existing.players.some((p) => p.playerId === me.playerId)) return existing;
    } catch {
      /* 查询也失败时报告加入时的错误 */
    }
    throw joinError;
  }
}

/** 错误 → 给用户看的文案 */
export function requestErrorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : String(err);
}
