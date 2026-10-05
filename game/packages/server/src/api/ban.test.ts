import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Koa from 'koa';
import { createApp } from '../app.js';
import { createAdminRouter } from './admin.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { InMemoryBanChecker } from '../services/BanChecker.js';
import { InMemoryReportArchive } from '../services/ReportService.js';
import {
  createMemoryIdentityPrisma,
  type MemoryIdentityPrisma,
} from '../testing/memoryIdentity.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../infra/logger.js';

const OPERATOR = 'op-secret-0123456789';
let server: Server | null = null;
let base = '';
let db: MemoryIdentityPrisma;
let disconnected: string[];

beforeEach(async () => {
  vi.stubEnv('OPERATOR_TOKEN', OPERATOR);
  vi.stubEnv('OPERATOR_ID', 'op-1');
  vi.clearAllMocks();
  db = createMemoryIdentityPrisma();
  disconnected = [];
  const app = createApp({
    identityPrisma: db,
    rateLimit: async (_ctx, next) => {
      await next();
    },
    disconnectPlayer: (id) => {
      disconnected.push(id);
      return 1;
    },
  });
  server = createServer(app.callback());
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

interface Created {
  playerId: string;
  token: string;
  recoveryCode: string;
}

async function createPlayer(): Promise<Created> {
  const res = await fetch(`${base}/identity/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: '甲' }),
  });
  return (await res.json()) as Created;
}

const admin = (path: string, body?: unknown, token: string | null = OPERATOR) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

const me = (token: string) =>
  fetch(`${base}/identity/me`, { headers: { authorization: `Bearer ${token}` } });

const recover = (code: string) =>
  fetch(`${base}/identity/recover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });

describe('运营封禁接口', () => {
  it('未带令牌 401，错误令牌 401', async () => {
    const p = await createPlayer();
    expect((await admin(`/admin/players/${p.playerId}/ban`, {}, null)).status).toBe(401);
    expect((await admin(`/admin/players/${p.playerId}/ban`, {}, 'wrong')).status).toBe(401);
    expect((await admin(`/admin/players/${p.playerId}/unban`, {}, null)).status).toBe(401);
    expect((await me(p.token)).status).toBe(200);
  });

  it('玩家不存在 404', async () => {
    expect((await admin('/admin/players/nope/ban')).status).toBe(404);
    expect((await admin('/admin/players/nope/unban')).status).toBe(404);
  });

  it('玩家 ID 不是 UUID 时直接 404，不去查库', async () => {
    const findUnique = vi.fn(async () => null);
    const update = vi.fn(async () => ({}));
    const router = createAdminRouter({
      auth: async (ctx, next) => {
        ctx.state.operator = { operatorId: 'op-1' };
        await next();
      },
      archive: new InMemoryReportArchive(),
      players: { findUnique, update },
      bans: new InMemoryBanChecker(),
    });
    const app = new Koa();
    app.use(errorHandler);
    app.use(router.routes());
    const srv = createServer(app.callback());
    await new Promise<void>((resolve) => srv.listen(0, resolve));
    const port = (srv.address() as AddressInfo).port;
    try {
      for (const verb of ['ban', 'unban']) {
        const res = await fetch(`http://127.0.0.1:${port}/admin/players/nope/${verb}`, {
          method: 'POST',
        });
        expect(res.status).toBe(404);
      }
      expect(findUnique).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  it('请求体非法时 422：原因超长、时间格式错误、到期时间已过', async () => {
    const p = await createPlayer();
    const url = `/admin/players/${p.playerId}/ban`;
    expect((await admin(url, { reason: 'x'.repeat(201) })).status).toBe(422);
    expect((await admin(url, { until: 'tomorrow' })).status).toBe(422);
    expect((await admin(url, { until: '2000-01-01T00:00:00Z' })).status).toBe(422);
    expect((await me(p.token)).status).toBe(200);
  });

  it('封禁立刻生效（缓存失效），断开连接并打 warn 日志；解封立刻恢复', async () => {
    const p = await createPlayer();
    // 先读一次，让「未封禁」进入缓存
    expect((await me(p.token)).status).toBe(200);

    const banned = await admin(`/admin/players/${p.playerId}/ban`, { reason: '作弊' });
    expect(banned.status).toBe(200);
    expect(disconnected).toEqual([p.playerId]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ operatorId: 'op-1', playerId: p.playerId, reason: '作弊' }),
      'player banned',
    );

    const blocked = await me(p.token);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ error: { code: 'BANNED' } });

    const lifted = await admin(`/admin/players/${p.playerId}/unban`);
    expect(lifted.status).toBe(200);
    // 解封不踢连接，也不会给客户端发「已被封禁」
    expect(disconnected).toEqual([p.playerId]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ operatorId: 'op-1', playerId: p.playerId }),
      'player unbanned',
    );
    expect((await me(p.token)).status).toBe(200);
  });

  it('带到期时间的封禁在到期后不再拦截', async () => {
    const p = await createPlayer();
    const until = new Date(Date.now() + 60_000).toISOString();
    expect((await admin(`/admin/players/${p.playerId}/ban`, { until })).status).toBe(200);
    expect((await me(p.token)).status).toBe(403);

    // 把到期时间改到过去：封禁查询器按 30 秒缓存，到期后的鉴权路径应放行
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 120_000 });
    try {
      expect((await me(p.token)).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('封禁生效时再把到期时间改到过去，恢复码流程也放行', async () => {
    const p = await createPlayer();
    const until = new Date(Date.now() + 60_000).toISOString();
    await admin(`/admin/players/${p.playerId}/ban`, { until });
    await db.player.update({
      where: { id: p.playerId },
      data: { banUntil: new Date(Date.now() - 1000) },
    });
    expect((await recover(p.recoveryCode)).status).toBe(200);
  });

  it('未被封禁的账号被解封：不断开连接', async () => {
    const p = await createPlayer();
    expect((await admin(`/admin/players/${p.playerId}/unban`)).status).toBe(200);
    expect(disconnected).toEqual([]);
  });
});

describe('POST /identity/recover 的封禁判定', () => {
  it('永久封禁的账号不能用恢复码恢复', async () => {
    const p = await createPlayer();
    await admin(`/admin/players/${p.playerId}/ban`);
    expect((await recover(p.recoveryCode)).status).toBe(422);
  });
});
