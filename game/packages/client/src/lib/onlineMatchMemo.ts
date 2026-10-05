// 进行中联机对局的本地记录：刷新或回到大厅后可一键返回

const KEY = 'icgame-online-match';

export interface OnlineMatchMemo {
  matchID: string;
  code: string | null;
}

function defaultStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function rememberOnlineMatch(
  memo: OnlineMatchMemo,
  storage: Storage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(memo));
  } catch {
    /* 存储不可用时忽略 */
  }
}

export function readOnlineMatch(
  storage: Storage | null = defaultStorage(),
): OnlineMatchMemo | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<OnlineMatchMemo> | null;
    if (!data || typeof data.matchID !== 'string' || !data.matchID) return null;
    const code = typeof data.code === 'string' && data.code ? data.code : null;
    return { matchID: data.matchID, code };
  } catch {
    return null;
  }
}

export function forgetOnlineMatch(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* 存储不可用时忽略 */
  }
}
