// 对局页分流：按地址参数与令牌决定进入联机 / 本地 / 固定场景（调试）

export type GameMode =
  | { mode: 'online' }
  | { mode: 'online-unavailable' }
  | { mode: 'local'; players: number }
  | { mode: 'fixture' };

/** 无后端时本地身份使用的伪令牌前缀 */
const MOCK_TOKEN_PREFIX = 'mock-';
const MIN_LOCAL_PLAYERS = 3;

export function resolveGameMode(searchParams: URLSearchParams, token: string | null): GameMode {
  if (searchParams.get('online') === '1') {
    return token && !token.startsWith(MOCK_TOKEN_PREFIX)
      ? { mode: 'online' }
      : { mode: 'online-unavailable' };
  }
  const players = parseInt(searchParams.get('players') ?? '0', 10);
  if (searchParams.get('friend') === '1' && players >= MIN_LOCAL_PLAYERS) {
    return { mode: 'local', players };
  }
  return { mode: 'fixture' };
}
