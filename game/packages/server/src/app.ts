import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { logger } from './infra/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { healthRouter } from './api/health.js';
import { identityRouter } from './api/identity.js';
import { roomsRouter } from './api/rooms.js';
import { playersRouter } from './api/players.js';
import { matchesRouter } from './api/matches.js';
import { replaysRouter } from './api/replays.js';
import { reportsRouter } from './api/reports.js';
import { shortLinkRouter } from './api/shortLink.js';

export function createApp(): Koa {
  const app = new Koa();

  // 全局中间件
  app.use(errorHandler);
  app.use(bodyParser());
  app.use(rateLimitMiddleware);

  // 请求日志
  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.info({ method: ctx.method, url: ctx.url, status: ctx.status, ms }, 'request');
  });

  // API 路由（按前缀挂载）
  app.use(identityRouter.routes());
  app.use(identityRouter.allowedMethods());

  app.use(roomsRouter.routes());
  app.use(roomsRouter.allowedMethods());

  app.use(playersRouter.routes());
  app.use(playersRouter.allowedMethods());

  app.use(matchesRouter.routes());
  app.use(matchesRouter.allowedMethods());

  app.use(reportsRouter.routes());
  app.use(reportsRouter.allowedMethods());

  app.use(replaysRouter.routes());
  app.use(replaysRouter.allowedMethods());

  // 健康检查
  app.use(healthRouter.routes());
  app.use(healthRouter.allowedMethods());

  // 短链跳转（最后挂载，避免 /r/:code 与其他路由冲突）
  app.use(shortLinkRouter.routes());
  app.use(shortLinkRouter.allowedMethods());

  return app;
}
