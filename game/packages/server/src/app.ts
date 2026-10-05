import Koa, { type Middleware } from 'koa';
import bodyParser from 'koa-bodyparser';
import { logger } from './infra/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { healthRouter } from './api/health.js';
import { identityRouter } from './api/identity.js';
import { createRoomsRouter } from './api/rooms.js';
import { LobbyService } from './services/LobbyService.js';
import { playersRouter } from './api/players.js';
import { createMatchesRouter } from './api/matches.js';
import { createReplaysRouter } from './api/replays.js';
import { PrismaMatchArchive, type MatchArchive } from './match/MatchArchive.js';
import { prisma } from './infra/postgres.js';
import { reportsRouter } from './api/reports.js';
import { adminRouter } from './api/admin.js';
import { chatRouter } from './api/chat.js';
import { shortLinkRouter } from './api/shortLink.js';

export interface AppDeps {
  lobby?: LobbyService;
  /** 全局限流中间件；不给时用基于 Redis 的 IP 限流 */
  rateLimit?: Middleware;
  /** 对局归档；回放与对局事件接口从这里读。不给时用 PrismaMatchArchive */
  archive?: MatchArchive;
}

export function createApp(deps: AppDeps = {}): Koa {
  const app = new Koa();

  // 全局中间件
  app.use(errorHandler);
  app.use(bodyParser());
  app.use(deps.rateLimit ?? rateLimitMiddleware);

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

  const roomsRouter = createRoomsRouter(deps.lobby ?? new LobbyService());
  app.use(roomsRouter.routes());
  app.use(roomsRouter.allowedMethods());

  app.use(playersRouter.routes());
  app.use(playersRouter.allowedMethods());

  const archive = deps.archive ?? new PrismaMatchArchive(prisma);
  const matchesRouter = createMatchesRouter({ archive });
  app.use(matchesRouter.routes());
  app.use(matchesRouter.allowedMethods());

  app.use(reportsRouter.routes());
  app.use(reportsRouter.allowedMethods());

  // 运营面板（W22-B Sprint 2）
  app.use(adminRouter.routes());
  app.use(adminRouter.allowedMethods());

  const replaysRouter = createReplaysRouter({ archive });
  app.use(replaysRouter.routes());
  app.use(replaysRouter.allowedMethods());

  app.use(chatRouter.routes());
  app.use(chatRouter.allowedMethods());

  // 健康检查
  app.use(healthRouter.routes());
  app.use(healthRouter.allowedMethods());

  // 短链跳转（最后挂载，避免 /r/:code 与其他路由冲突）
  app.use(shortLinkRouter.routes());
  app.use(shortLinkRouter.allowedMethods());

  return app;
}
