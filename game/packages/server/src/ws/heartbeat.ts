// 心跳 + 断线检测（参照设计文档 §7.4.4）

import { Redis } from 'ioredis';
import { createRedisClient } from '../infra/redis.js';
import { WSKeys } from './types.js';
import { logger } from '../infra/logger.js';

const DISCONNECT_THRESHOLD_MS = 30_000; // 30s 无心跳标记断线
const HB_KEY_TTL = 45; // Redis TTL 秒

export class HeartbeatManager {
  private redis: Redis;

  constructor() {
    this.redis = createRedisClient();
  }

  // 收到心跳，刷新 TTL
  async recordHeartbeat(matchId: string, playerId: string): Promise<void> {
    const key = WSKeys.heartbeat(matchId, playerId);
    await this.redis.setex(key, HB_KEY_TTL, Date.now().toString());
  }

  // 检查是否在线
  async isAlive(matchId: string, playerId: string): Promise<boolean> {
    const key = WSKeys.heartbeat(matchId, playerId);
    const val = await this.redis.get(key);
    if (!val) return false;
    const lastHb = parseInt(val, 10);
    return Date.now() - lastHb < DISCONNECT_THRESHOLD_MS;
  }

  // 获取最后心跳时间
  async getLastHeartbeat(matchId: string, playerId: string): Promise<number | null> {
    const key = WSKeys.heartbeat(matchId, playerId);
    const val = await this.redis.get(key);
    return val ? parseInt(val, 10) : null;
  }

  // 标记断线（删除心跳 key）
  async markDisconnected(matchId: string, playerId: string): Promise<void> {
    const key = WSKeys.heartbeat(matchId, playerId);
    await this.redis.del(key);
    logger.info({ matchId, playerId }, 'Player marked as disconnected');
  }
}
