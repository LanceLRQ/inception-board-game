import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { logger } from './infra/logger.js';
import { healthRouter } from './api/health.js';

export function createApp(): Koa {
  const app = new Koa();

  app.use(bodyParser());

  // 请求日志
  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.info({ method: ctx.method, url: ctx.url, status: ctx.status, ms }, 'request');
  });

  // 路由
  app.use(healthRouter.routes());
  app.use(healthRouter.allowedMethods());

  return app;
}
