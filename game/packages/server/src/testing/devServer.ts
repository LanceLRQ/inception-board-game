// 全内存依赖的可执行服务：不需要 Redis 与 PostgreSQL，供浏览器端到端用例使用
//
// 对局存储、归档、限流、大厅与心跳的 Redis 都用进程内实现；身份数据存在内存表里。
// 时长取自 MATCH_BOT_STEP_DELAY_MS / MATCH_PENDING_TIMEOUT_MS / MATCH_TURN_TIMEOUT_MS，
// 以及响应窗口上限 MATCH_RESPONSE_TIMEOUT_CAP_MS，端到端里取短值让无人操作的座位很快被代发。
// 只在测试目录下使用，生产入口不引用它。

import { pathToFileURL } from 'node:url';
import { buildRealtime, timingFromEnv, type Realtime } from '../bootstrap.js';
import { logger } from '../infra/logger.js';
import { InMemoryMatchArchive } from '../match/MatchArchive.js';
import { InMemoryMatchStore } from '../match/MatchStore.js';
import type { TimingConfig } from '../match/scheduling.js';
import type { LobbyRedis } from '../services/LobbyService.js';
import { InMemoryRateGuard } from '../services/RateGuardService.js';
import { createMemoryIdentityPrisma } from './memoryIdentity.js';

/** 进程内的 Redis 子集：键值与过期时间，足够大厅与心跳使用 */
export class MemoryRedis implements LobbyRedis {
  private readonly data = new Map<string, { value: string; expiresAt: number }>();

  private live(key: string): string | null {
    const hit = this.data.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return hit.value;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key);
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.data.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async set(
    key: string,
    value: string,
    _ex: 'EX',
    seconds: number,
    _nx: 'NX',
  ): Promise<string | null> {
    if (this.live(key) !== null) return null;
    await this.setex(key, seconds, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.live(key) === null ? 0 : 1;
  }
}

export interface DevServerOptions {
  port?: number;
  timing?: TimingConfig;
  /** 允许跨域访问的页面源（客户端开发服务的地址） */
  corsOrigin?: string;
}

export interface DevServer {
  rt: Realtime;
  url: string;
  stop(): Promise<void>;
}

export async function startDevServer(opts: DevServerOptions = {}): Promise<DevServer> {
  const redis = new MemoryRedis();
  const identity = createMemoryIdentityPrisma();
  const origin = opts.corsOrigin ?? '*';
  const rt = buildRealtime({
    store: new InMemoryMatchStore(),
    archive: new InMemoryMatchArchive(),
    lobbyRedis: redis,
    lobbyPrisma: identity,
    identityPrisma: identity,
    // 内存服务没有对局成员表，不挂举报接口
    reports: null,
    heartbeatRedis: redis,
    rateGuard: new InMemoryRateGuard({ maxPerWindow: 1_000_000 }),
    timing: opts.timing ?? devTimingFromEnv(process.env),
    // 内存服务没有 Redis，所以不挂基于 Redis 的 HTTP 限流（房间页每 3 秒轮询一次，生产环境靠额度配置承接）
    httpRateLimit: async (_ctx, next) => {
      await next();
    },
    ws: { corsOrigin: origin, path: '/ws' },
  });
  const port = await rt.start(opts.port ?? 0);
  logger.info({ port }, 'in-memory dev server started');
  return { rt, url: `http://127.0.0.1:${port}`, stop: () => rt.stop() };
}

function devTimingFromEnv(env: NodeJS.ProcessEnv): TimingConfig {
  const timing = timingFromEnv(env);
  const cap = Number(env.MATCH_RESPONSE_TIMEOUT_CAP_MS);
  return Number.isInteger(cap) && cap > 0 ? { ...timing, responseTimeoutCapMs: cap } : timing;
}

// 直接用 tsx 运行时监听 PORT
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = parseInt(process.env.PORT ?? '3101', 10);
  const corsOrigin = process.env.WS_CORS_ORIGIN;
  startDevServer({ port, ...(corsOrigin ? { corsOrigin } : {}) }).catch((err: unknown) => {
    logger.error({ err }, 'dev server failed to start');
    process.exit(1);
  });
}
