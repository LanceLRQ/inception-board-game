// 对局人数范围：服务端建局、房间 API、房间页的开始按钮、引擎的人数限制共用这一处，避免各自写一份而不一致
// 对照：docs/manual/02-game-setup.md 人数配置（本项目目前支持 4-10 人，3 人局尚未支持）

/** 一局最少人数 */
export const MATCH_MIN_PLAYERS = 4;
/** 一局最多人数 */
export const MATCH_MAX_PLAYERS = 10;

/** 人数是否在可开局的范围内（整数且 4–10） */
export function isMatchPlayerCount(count: number): boolean {
  return Number.isInteger(count) && count >= MATCH_MIN_PLAYERS && count <= MATCH_MAX_PLAYERS;
}

/** 距离可以开局还差几人；已够人数返回 0 */
export function playersShortOfMinimum(count: number): number {
  return Math.max(0, MATCH_MIN_PLAYERS - count);
}
