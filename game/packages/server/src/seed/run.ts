// 初始数据入口：连库 → 在一个事务里写入 → 打日志 → 按结果退出
//
// 用法：pnpm --filter @icgame/server db:seed（也是 prisma db seed 调用的命令）。
// 幂等：可重复执行；部署时紧跟在 prisma migrate deploy 之后运行。

import { logger } from '../infra/logger.js';
import { prisma, shutdownDatabase } from '../infra/postgres.js';
import { createPrismaSeedStore } from './prismaSeedStore.js';
import { runSeed } from './seed.js';

async function main(): Promise<void> {
  const summary = await prisma.$transaction((tx) => runSeed(createPrismaSeedStore(tx)));
  logger.info(summary, 'seed done');
}

main()
  .then(() => shutdownDatabase())
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error({ err }, 'seed failed');
    shutdownDatabase().finally(() => process.exit(1));
  });
