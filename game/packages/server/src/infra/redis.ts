import Redis from 'ioredis';
import { logger } from './logger.js';

export function createRedisClient(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  client.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  client.on('connect', () => logger.info('Redis connected'));

  return client;
}
