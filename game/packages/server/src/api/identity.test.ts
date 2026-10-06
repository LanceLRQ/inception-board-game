import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { createMemoryIdentityPrisma } from '../testing/memoryIdentity.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

async function start(): Promise<string> {
  const app = createApp({
    identityPrisma: createMemoryIdentityPrisma(),
    rateLimit: async (_ctx, next) => {
      await next();
    },
  });
  server = createServer(app.callback());
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('身份路由使用注入的数据库', () => {
  it('建档后能凭令牌读到自己，并能凭恢复码恢复', async () => {
    const base = await start();
    const init = await fetch(`${base}/identity/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: '甲' }),
    });
    expect(init.status).toBe(201);
    const created = (await init.json()) as {
      playerId: string;
      token: string;
      recoveryCode: string;
    };

    const me = await fetch(`${base}/identity/me`, {
      headers: { authorization: `Bearer ${created.token}` },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ playerId: created.playerId, nickname: '甲' });

    const recovered = await fetch(`${base}/identity/recover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: created.recoveryCode }),
    });
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({ playerId: created.playerId });
  });

  async function post(base: string, path: string, body: unknown, token?: string, method = 'POST') {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('建档时昵称存规范化后的值；全空白与违禁词被拒绝', async () => {
    const base = await start();
    const ok = await post(base, '/identity/init', { nickname: '  ＡＢ\u200B  c ' });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ nickname: 'AB c' });
    expect((await post(base, '/identity/init', { nickname: '   ' })).status).toBe(400);
    expect((await post(base, '/identity/init', { nickname: '官方客服' })).status).toBe(400);
    expect((await post(base, '/identity/init', { nickname: 'x'.repeat(21) })).status).toBe(400);
  });

  it('修改昵称同样规范化并拒绝非法值，令牌里带新昵称', async () => {
    const base = await start();
    const created = (await (await post(base, '/identity/init', { nickname: '甲' })).json()) as {
      token: string;
    };
    const bad = await post(
      base,
      '/identity/me',
      { nickname: 'x'.repeat(21) },
      created.token,
      'PATCH',
    );
    expect(bad.status).toBe(400);
    const good = await post(base, '/identity/me', { nickname: ' ＺＺ ' }, created.token, 'PATCH');
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ nickname: 'ZZ' });
  });

  it('超长的 locale / fingerprint / avatarSeed 得到 400 而不是 500 或 200', async () => {
    const base = await start();
    expect((await post(base, '/identity/init', { locale: 'x'.repeat(11) })).status).toBe(400);
    expect((await post(base, '/identity/init', { fingerprint: 'f'.repeat(129) })).status).toBe(400);
    const created = (await (await post(base, '/identity/init', { nickname: '甲' })).json()) as {
      token: string;
    };
    const patch = (body: unknown) => post(base, '/identity/me', body, created.token, 'PATCH');
    expect((await patch({ avatarSeed: 'a'.repeat(65) })).status).toBe(400);
    expect((await patch({ locale: 'x'.repeat(11) })).status).toBe(400);
    expect((await patch({ avatarSeed: 'a'.repeat(64), locale: 'x'.repeat(10) })).status).toBe(200);
  });
});
