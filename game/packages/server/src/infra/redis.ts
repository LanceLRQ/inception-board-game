import Redis from 'ioredis';
import { logger } from './logger.js';

/** 命令超时默认值（毫秒） */
export const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 5000;

/** 读取命令超时（环境变量 REDIS_COMMAND_TIMEOUT_MS）；缺省或非正整数时用默认值 */
export function resolveRedisCommandTimeout(env: NodeJS.ProcessEnv): number {
  const raw = env.REDIS_COMMAND_TIMEOUT_MS?.trim();
  if (raw === undefined || !/^\d+$/.test(raw)) return DEFAULT_REDIS_COMMAND_TIMEOUT_MS;
  const n = Number(raw);
  return n > 0 ? n : DEFAULT_REDIS_COMMAND_TIMEOUT_MS;
}

export function createRedisClient(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const client = new Redis(url, {
    // 连接半开时命令会一直挂着，把对局房间的任务队列堵死；超时后命令以错误返回，交给调用方的重试与降级。
    // 本服务没有订阅连接，也不用阻塞命令，所有命令都可以套这个超时
    commandTimeout: resolveRedisCommandTimeout(process.env),
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  client.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  client.on('connect', () => logger.info('Redis connected'));

  return client;
}
