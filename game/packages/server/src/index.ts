import { purgeExpiredShortLinks } from './api/shortLink.js';
import { buildRealtime, timingFromEnv } from './bootstrap.js';
import { logger } from './infra/logger.js';
import { startPeriodic } from './infra/periodic.js';
import { prisma } from './infra/postgres.js';
import { createRedisClient } from './infra/redis.js';
import { PrismaMatchArchive } from './match/MatchArchive.js';
import { RedisMatchStore } from './match/MatchStore.js';
import { isOperatorTokenTooShort, MIN_OPERATOR_TOKEN_LENGTH } from './middleware/operatorAuth.js';
import { parseOrigins } from './middleware/cors.js';
import { resolveRecoveryPepper } from './infra/recoveryCode.js';
import { RedisRecoverAttemptLimiter } from './services/RecoverAttemptLimiter.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// 生产环境缺少恢复码哈希密钥时直接退出，避免用开发值签发恢复码
try {
  resolveRecoveryPepper(process.env);
} catch (err) {
  logger.error({ err }, 'recovery code pepper missing');
  process.exit(1);
}

if (isOperatorTokenTooShort(process.env)) {
  logger.warn(
    { minLength: MIN_OPERATOR_TOKEN_LENGTH },
    'OPERATOR_TOKEN 太短，运营接口保持关闭；请换成更长的随机令牌',
  );
}

const redis = createRedisClient();
const realtime = buildRealtime({
  store: new RedisMatchStore(redis),
  archive: new PrismaMatchArchive(prisma),
  lobbyRedis: redis,
  lobbyPrisma: prisma,
  heartbeatRedis: redis,
  recoverLimiter: new RedisRecoverAttemptLimiter(redis),
  timing: timingFromEnv(process.env),
  ws: {
    corsOrigin: parseOrigins(process.env.WS_CORS_ORIGIN ?? '*'),
    path: process.env.WS_PATH ?? '/ws',
  },
  trustProxy: process.env.TRUST_PROXY === '1',
});

/** 过期短链的清理间隔 */
const SHORT_LINK_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let stopShortLinkCleanup: () => void = () => {};

async function main(): Promise<void> {
  try {
    const result = await realtime.matches.restoreAll();
    logger.info(result, 'matches restored');
  } catch (err) {
    logger.error({ err }, 'restoreAll failed, starting without restored matches');
  }
  const port = await realtime.start(PORT);
  stopShortLinkCleanup = startPeriodic(
    'short-link-cleanup',
    SHORT_LINK_CLEANUP_INTERVAL_MS,
    async () => {
      const removed = await purgeExpiredShortLinks();
      if (removed > 0) logger.info({ removed }, 'expired short links removed');
    },
  );
  logger.info({ port }, 'Server started (HTTP + WS)');
}

const shutdown = (signal: string, exitCode = 0) => {
  logger.info({ signal }, 'Shutting down');
  stopShortLinkCleanup();
  realtime
    .stop()
    .catch((err: unknown) => logger.error({ err }, 'shutdown failed'))
    .finally(() => process.exit(exitCode));
};

// 兜底：任何没被接住的异常都要留下日志；未捕获异常之后进程状态不可信，走正常关停流程退出
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (err: Error) => {
  logger.error({ err }, 'uncaught exception');
  shutdown('uncaughtException', 1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err: unknown) => {
  logger.error({ err }, 'startup failed');
  process.exit(1);
});
