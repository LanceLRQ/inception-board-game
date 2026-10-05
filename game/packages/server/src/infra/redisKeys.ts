// Redis 键命名规范
// 格式：`ico:{domain}:{entity}:{id}[:field]`

const PREFIX = 'ico';

export const RedisKeys = {
  // 对局快照（完整状态 + 座位表 + 建局参数，整体一个 JSON 字符串）
  matchSnapshot: (matchId: string) => `${PREFIX}:match:${matchId}`,
  // 进行中的对局 id 集合
  matchActive: () => `${PREFIX}:match:active`,

  // 自有业务
  playerSession: (playerId: string) => `${PREFIX}:session:player:${playerId}`,
  roomState: (roomCode: string) => `${PREFIX}:room:${roomCode}`,
  // 房间开始游戏的短期锁，防止并发开始建出两局
  roomStarting: (roomCode: string) => `${PREFIX}:room:${roomCode}:starting`,
  roomPlayers: (roomCode: string) => `${PREFIX}:room:${roomCode}:players`,
  shortLink: (code: string) => `${PREFIX}:link:${code}`,
  // 恢复码失败计数（按来源地址）
  recoverFailures: (ip: string) => `${PREFIX}:recover:fail:${ip}`,
  rateLimit: (key: string) => `${PREFIX}:ratelimit:${key}`,
  matchmakingQueue: () => `${PREFIX}:matchmaking:queue`,
} as const;

// TTL 常量（秒）
export const RedisTTL = {
  MATCH_FINISHED: 86400, // 对局结束后快照保留 1 天
  SHORT_LINK: 86400 * 7, // 7 天
  SESSION: 86400 * 30, // 30 天
  RATE_LIMIT_WINDOW: 60, // 1 分钟
  ROOM_TTL: 86400, // 1 天
} as const;
