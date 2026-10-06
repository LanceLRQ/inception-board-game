// 实时服务装配：把存储、对局服务、网关、大厅与 HTTP 接口接在一起
//
// 依赖全部可注入，便于用内存实现起一套完整服务做测试；index.ts 只负责读环境变量并传入真实依赖。

import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type Koa from 'koa';
import type { Middleware } from 'koa';
import { createApp } from './app.js';
import type { IdentityPrisma } from './api/identity.js';
import type { ReportsRouterDeps } from './api/reports.js';
import { logger } from './infra/logger.js';
import type { MatchArchive } from './match/MatchArchive.js';
import type { RoomDeps } from './match/MatchRoom.js';
import { MatchService } from './match/MatchService.js';
import type { MatchStore } from './match/MatchStore.js';
import { DEFAULT_TIMING, type TimingConfig } from './match/scheduling.js';
import { prisma } from './infra/postgres.js';
import { createBanChecker, type BanChecker } from './services/BanChecker.js';
import type { RecoverAttemptLimiter } from './services/RecoverAttemptLimiter.js';
import { BotManager } from './services/BotManager.js';
import { ChatService } from './services/ChatService.js';
import { LobbyService, type LobbyPrisma, type LobbyRedis } from './services/LobbyService.js';
import { MoveGateway } from './services/MoveGateway.js';
import { InMemoryRateGuard, type RateGuardMutable } from './services/RateGuardService.js';
import { ConnectionRegistry } from './ws/connectionRegistry.js';
import { SocketGateway } from './ws/gateway.js';
import { HeartbeatManager, type HeartbeatRedis } from './ws/heartbeat.js';
import { WSMessageRouter } from './ws/messageRouter.js';

export interface RealtimeDeps {
  store: MatchStore;
  archive: MatchArchive;
  lobbyRedis?: LobbyRedis;
  lobbyPrisma?: LobbyPrisma;
  /** 身份接口的数据库访问；默认全局数据库客户端 */
  identityPrisma?: IdentityPrisma;
  /** 恢复码失败限速计数器；默认进程内实现（生产入口传 Redis 实现） */
  recoverLimiter?: RecoverAttemptLimiter;
  /** 封禁查询器；默认在身份数据库（未给时用全局数据库）上建带缓存的实现 */
  bans?: BanChecker;
  /** 举报接口依赖；不给时用全局数据库，null 表示不挂载 */
  reports?: ReportsRouterDeps | null;
  heartbeatRedis?: HeartbeatRedis;
  /** 默认 InMemoryRateGuard */
  rateGuard?: RateGuardMutable;
  /** 默认 DEFAULT_TIMING */
  timing?: TimingConfig;
  /** 默认真实的 setTimeout / clearTimeout / Date.now */
  timers?: RoomDeps['timers'];
  /** 默认 new BotManager() */
  bot?: BotManager;
  ws?: { corsOrigin?: string | string[]; path?: string };
  /** 全局 HTTP 限流中间件；默认基于 Redis 的 IP 限流 */
  httpRateLimit?: Middleware;
  /** 位于反向代理之后：HTTP 来源地址取 X-Forwarded-For；默认关闭 */
  trustProxy?: boolean;
}

export interface Realtime {
  app: Koa;
  httpServer: HttpServer;
  gateway: SocketGateway;
  matches: MatchService;
  lobby: LobbyService;
  bot: BotManager;
  /** 开始监听，返回实际端口（传 0 时由系统分配） */
  start(port: number): Promise<number>;
  /** 停 Bot 定时器、关房间、断开网关、关 HTTP */
  stop(): Promise<void>;
}

const realTimers: RoomDeps['timers'] = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export function buildRealtime(deps: RealtimeDeps): Realtime {
  const bot = deps.bot ?? new BotManager();
  const registry = new ConnectionRegistry();
  const heartbeat = new HeartbeatManager(deps.heartbeatRedis);
  const moveGateway = new MoveGateway(deps.rateGuard ?? new InMemoryRateGuard());
  const bans = deps.bans ?? createBanChecker(deps.identityPrisma ?? prisma);

  // 聊天先挂一个转调网关的广播函数；网关建好之后才有真正的广播
  const chat = new ChatService((matchID, msg) => gateway.broadcastToMatch(matchID, msg));
  const router = new WSMessageRouter({ heartbeat, bot, chat });
  const gateway = new SocketGateway(
    { registry, router, bot, heartbeat, moveGateway, bans },
    deps.ws ?? {},
  );

  const matches = new MatchService({
    store: deps.store,
    archive: deps.archive,
    bot,
    timing: deps.timing ?? DEFAULT_TIMING,
    timers: deps.timers ?? realTimers,
    onStep: (matchID, output) => gateway.sendStep(matchID, output),
    onSeatsChanged: (matchID) => gateway.sendSeats(matchID),
    onStorageHealth: (matchID, healthy) => gateway.sendStorageHealth(matchID, healthy),
    onResync: (matchID) => gateway.resyncMatch(matchID),
    onAborted: (matchID) => gateway.abortMatch(matchID),
    // 对局结束的标记已在最后一条 icg:step 的视图里
    onGameOver: (matchID) => {
      logger.info({ matchID }, 'match over');
    },
  });
  gateway.bindMatches(matches);

  const lobby = new LobbyService({
    redis: deps.lobbyRedis,
    prisma: deps.lobbyPrisma,
    matches,
  });
  const app = createApp({
    lobby,
    rateLimit: deps.httpRateLimit,
    archive: deps.archive,
    identityPrisma: deps.identityPrisma,
    recoverLimiter: deps.recoverLimiter,
    bans,
    disconnectPlayer: (playerId) => gateway.disconnectPlayer(playerId),
    ...(deps.reports !== undefined ? { reports: deps.reports } : {}),
    corsOrigin: deps.ws?.corsOrigin,
    trustProxy: deps.trustProxy,
  });
  const httpServer = createServer(app.callback());
  gateway.attach(httpServer);

  return {
    app,
    httpServer,
    gateway,
    matches,
    lobby,
    bot,
    start(port) {
      bot.start();
      return new Promise<number>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          httpServer.off('error', reject);
          resolve((httpServer.address() as AddressInfo).port);
        });
      });
    },
    async stop() {
      bot.stop();
      matches.shutdown();
      gateway.detach();
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
          httpServer.closeAllConnections();
        });
      }
    },
  };
}

function readMs(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    logger.warn({ key }, 'invalid timing env value, using default');
    return fallback;
  }
  return n;
}

/** 从环境变量读取排程时长；非法值回落到默认并记 WARN */
export function timingFromEnv(env: NodeJS.ProcessEnv): TimingConfig {
  return {
    botStepDelayMs: readMs(env, 'MATCH_BOT_STEP_DELAY_MS', DEFAULT_TIMING.botStepDelayMs),
    pendingTimeoutMs: readMs(env, 'MATCH_PENDING_TIMEOUT_MS', DEFAULT_TIMING.pendingTimeoutMs),
    turnTimeoutMs: readMs(env, 'MATCH_TURN_TIMEOUT_MS', DEFAULT_TIMING.turnTimeoutMs),
  };
}
