import Koa, { type Middleware } from 'koa';
import bodyParser from 'koa-bodyparser';
import { logger } from './infra/logger.js';
import { corsMiddleware, parseOrigins } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { healthRouter } from './api/health.js';
import { createIdentityRouter, type IdentityPrisma } from './api/identity.js';
import { createRoomsRouter } from './api/rooms.js';
import { createInviteRouter, inviteConfigFromEnv, type InviteConfig } from './api/invite.js';
import { LobbyService } from './services/LobbyService.js';
import { playersRouter } from './api/players.js';
import { createMatchesRouter } from './api/matches.js';
import { createReplaysRouter } from './api/replays.js';
import { PrismaMatchArchive, type MatchArchive } from './match/MatchArchive.js';
import { prisma } from './infra/postgres.js';
import {
  createDefaultReportsDeps,
  createReportsRouter,
  type ReportsRouterDeps,
} from './api/reports.js';
import { createAdminRouter } from './api/admin.js';
import { banCheckerContext } from './middleware/auth.js';
import { createBanChecker, type BanChecker } from './services/BanChecker.js';
import type { RecoverAttemptLimiter } from './services/RecoverAttemptLimiter.js';
import { chatRouter } from './api/chat.js';
import { shortLinkRouter } from './api/shortLink.js';

export interface AppDeps {
  lobby?: LobbyService;
  /** 全局限流中间件；不给时用基于 Redis 的 IP 限流 */
  rateLimit?: Middleware;
  /** 对局归档；回放与对局事件接口从这里读。不给时用 PrismaMatchArchive */
  archive?: MatchArchive;
  /** 身份接口的数据库访问；不给时用全局数据库客户端 */
  identityPrisma?: IdentityPrisma;
  /** 恢复码失败限速计数器；不给时用进程内实现 */
  recoverLimiter?: RecoverAttemptLimiter;
  /** 封禁查询器；鉴权中间件与运营接口共用。不给时用全局数据库 */
  bans?: BanChecker;
  /**
   * 断开某账号现有的全部连接，返回断开数。封禁生效时由运营接口调用（缺省按封禁处理），
   * 凭恢复码找回账号后由身份接口调用（带上 TOKEN_REVOKED）。
   */
  disconnectPlayer?: (playerId: string, code?: string, message?: string) => number;
  /** 举报接口的依赖；不给时用全局数据库；传 null 表示不挂举报路由（全内存服务没有对局成员表） */
  reports?: ReportsRouterDeps | null;
  /** 允许跨域访问的页面源；不给（或为空）时不放行任何跨域源，只有同源页面能访问 */
  corsOrigin?: string | string[];
  /** 邀请链接与分享卡片的配置；不给时读环境变量 PUBLIC_BASE_URL / INVITE_IMAGE_PATH */
  invite?: InviteConfig;
  /** 位于反向代理之后时开启：来源地址取 X-Forwarded-For。后端端口直接暴露公网时不要开启 */
  trustProxy?: boolean;
}

export function createApp(deps: AppDeps = {}): Koa {
  const app = new Koa();
  if (deps.trustProxy) {
    app.proxy = true;
    // 只认最近一层反代追加的地址；客户端自己带来的转发头排在前面，不能当作来源
    app.maxIpsCount = 1;
  }

  // 全局中间件；跨域在最外层，预检不计入限流，出错的响应也带跨域头
  if (deps.corsOrigin && parseOrigins(deps.corsOrigin).length > 0) {
    app.use(corsMiddleware(deps.corsOrigin));
  }
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

  // 封禁查询器挂到上下文，各路由里的 authMiddleware 据此拒绝被封禁的账号
  const bans = deps.bans ?? createBanChecker(deps.identityPrisma ?? prisma);
  app.use(banCheckerContext(bans));

  // API 路由（按前缀挂载）
  const identityRouter = createIdentityRouter({
    prisma: deps.identityPrisma,
    recoverLimiter: deps.recoverLimiter,
    ...(deps.disconnectPlayer ? { disconnectPlayer: deps.disconnectPlayer } : {}),
  });
  app.use(identityRouter.routes());
  app.use(identityRouter.allowedMethods());

  const lobby = deps.lobby ?? new LobbyService();
  const roomsRouter = createRoomsRouter(lobby);
  app.use(roomsRouter.routes());
  app.use(roomsRouter.allowedMethods());

  // 房间邀请链接：预览抓取器得到分享卡片，浏览器跳转到房间页
  const inviteRouter = createInviteRouter({
    lobby,
    config: deps.invite ?? inviteConfigFromEnv(process.env),
  });
  app.use(inviteRouter.routes());
  app.use(inviteRouter.allowedMethods());

  app.use(playersRouter.routes());
  app.use(playersRouter.allowedMethods());

  const archive = deps.archive ?? new PrismaMatchArchive(prisma);
  const matchesRouter = createMatchesRouter({ archive });
  app.use(matchesRouter.routes());
  app.use(matchesRouter.allowedMethods());

  if (deps.reports !== null) {
    const reportsRouter = createReportsRouter(deps.reports ?? createDefaultReportsDeps());
    app.use(reportsRouter.routes());
    app.use(reportsRouter.allowedMethods());
  }

  // 运营面板：举报审核与账号封禁
  const adminRouter = createAdminRouter({
    ...(deps.identityPrisma ? { players: deps.identityPrisma.player } : {}),
    bans,
    ...(deps.disconnectPlayer ? { disconnectPlayer: deps.disconnectPlayer } : {}),
  });
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
