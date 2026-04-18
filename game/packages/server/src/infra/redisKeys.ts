// Redis Key 命名规范（参照设计文档 §3.9.1）
// 格式：`ico:{domain}:{entity}:{id}[:field]`

const PREFIX = 'ico';

export const RedisKeys = {
  // BGIO 对局状态（设计文档保留 bgio: 前缀兼容）
  bgioMatch: (matchId: string) => `bgio:match:${matchId}`,
  bgioLog: (matchId: string) => `bgio:log:${matchId}`,

  // 自有业务
  playerSession: (playerId: string) => `${PREFIX}:session:player:${playerId}`,
  roomState: (roomCode: string) => `${PREFIX}:room:${roomCode}`,
  roomPlayers: (roomCode: string) => `${PREFIX}:room:${roomCode}:players`,
  shortLink: (code: string) => `${PREFIX}:link:${code}`,
  rateLimit: (key: string) => `${PREFIX}:ratelimit:${key}`,
  matchmakingQueue: () => `${PREFIX}:matchmaking:queue`,
} as const;

// TTL 常量（秒）
export const RedisTTL = {
  BGIO_MATCH: 86400 * 2, // 2 天
  SHORT_LINK: 86400 * 7, // 7 天
  SESSION: 86400 * 30, // 30 天
  RATE_LIMIT_WINDOW: 60, // 1 分钟
  ROOM_TTL: 86400, // 1 天
} as const;
