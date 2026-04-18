// 幂等与重连（参照设计文档 §7.4.5）

import { Redis } from 'ioredis';
import { createRedisClient } from '../infra/redis.js';
import { WSKeys } from './types.js';

export class ReconnectManager {
  private redis: Redis;

  constructor() {
    this.redis = createRedisClient();
  }

  // 获取当前事件序号
  async getEventSeq(matchId: string): Promise<number> {
    const key = WSKeys.eventSeq(matchId);
    const val = await this.redis.get(key);
    return val ? parseInt(val, 10) : 0;
  }

  // 递增事件序号并返回新值
  async incrementEventSeq(matchId: string): Promise<number> {
    const key = WSKeys.eventSeq(matchId);
    return this.redis.incr(key);
  }

  // 检查 intentID 是否已处理（幂等）
  async isIntentProcessed(matchId: string, playerId: string, intentID: string): Promise<boolean> {
    const key = WSKeys.playerIntentAck(matchId, playerId);
    const val = await this.redis.get(key);
    return val === intentID;
  }

  // 标记 intentID 已处理
  async markIntentProcessed(matchId: string, playerId: string, intentID: string): Promise<void> {
    const key = WSKeys.playerIntentAck(matchId, playerId);
    // 保留最近 1 个 intentID
    await this.redis.setex(key, 300, intentID);
  }

  // 重连时补发增量事件
  async getMissingEvents(
    matchId: string,
    lastEventSeq: number,
  ): Promise<{
    needsFullSync: boolean;
    fromSeq: number;
  }> {
    const currentSeq = await this.getEventSeq(matchId);

    if (lastEventSeq >= currentSeq) {
      return { needsFullSync: false, fromSeq: currentSeq };
    }

    // 序号差距过大则全量同步
    if (currentSeq - lastEventSeq > 100) {
      return { needsFullSync: true, fromSeq: 0 };
    }

    return { needsFullSync: false, fromSeq: lastEventSeq + 1 };
  }
}
