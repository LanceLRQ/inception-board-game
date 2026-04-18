// 乐观锁：跨实例并发控制（Redis state version）

import { Redis } from 'ioredis';
import { createRedisClient } from '../infra/redis.js';
import { AppError } from '../infra/errors.js';

export class OptimisticLock {
  private redis: Redis;

  constructor() {
    this.redis = createRedisClient();
  }

  // 获取当前版本号
  async getVersion(key: string): Promise<number> {
    const val = await this.redis.get(`ico:lock:${key}`);
    return val ? parseInt(val, 10) : 0;
  }

  // 尝试原子更新（CAS）
  // 返回 true 表示成功，false 表示版本冲突
  async tryUpdate(
    key: string,
    expectedVersion: number,
    update: () => Promise<void>,
  ): Promise<boolean> {
    const lockKey = `ico:lock:${key}`;
    const current = await this.redis.get(lockKey);
    const currentVersion = current ? parseInt(current, 10) : 0;

    if (currentVersion !== expectedVersion) {
      return false;
    }

    // 使用 Redis 事务保证原子性
    const multi = this.redis.multi();
    multi.set(lockKey, (expectedVersion + 1).toString());

    const results = await multi.exec();
    if (!results || results.some((r) => r[0] !== null)) {
      return false;
    }

    try {
      await update();
      return true;
    } catch {
      // 回滚版本号
      await this.redis.set(lockKey, currentVersion.toString());
      return false;
    }
  }

  // 带重试的更新
  async updateWithRetry(
    key: string,
    maxRetries: number,
    update: () => Promise<void>,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const version = await this.getVersion(key);
      const success = await this.tryUpdate(key, version, update);
      if (success) return;
    }
    throw new AppError('CONFLICT', '乐观锁冲突，请重试');
  }
}
