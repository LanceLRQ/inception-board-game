import { buildRealtime, timingFromEnv } from './bootstrap.js';
import { logger } from './infra/logger.js';
import { prisma } from './infra/postgres.js';
import { createRedisClient } from './infra/redis.js';
import { PrismaMatchArchive } from './match/MatchArchive.js';
import { RedisMatchStore } from './match/MatchStore.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const redis = createRedisClient();
const realtime = buildRealtime({
  store: new RedisMatchStore(redis),
  archive: new PrismaMatchArchive(prisma),
  lobbyRedis: redis,
  lobbyPrisma: prisma,
  heartbeatRedis: redis,
  timing: timingFromEnv(process.env),
  ws: { corsOrigin: process.env.WS_CORS_ORIGIN ?? '*', path: process.env.WS_PATH ?? '/ws' },
});

async function main(): Promise<void> {
  try {
    const result = await realtime.matches.restoreAll();
    logger.info(result, 'matches restored');
  } catch (err) {
    logger.error({ err }, 'restoreAll failed, starting without restored matches');
  }
  const port = await realtime.start(PORT);
  logger.info({ port }, 'Server started (HTTP + WS)');
}

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutting down');
  realtime
    .stop()
    .catch((err: unknown) => logger.error({ err }, 'shutdown failed'))
    .finally(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err: unknown) => {
  logger.error({ err }, 'startup failed');
  process.exit(1);
});
