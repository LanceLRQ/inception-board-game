import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Koa from 'koa';
import { corsMiddleware } from './cors.js';
import { errorHandler } from './errorHandler.js';
import { AppError } from '../infra/errors.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let server: Server | null = null;
const reached = vi.fn();

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
  reached.mockClear();
});

async function call(
  origin: string | string[],
  init: { method?: string; headers?: Record<string, string>; path?: string } = {},
): Promise<Response> {
  const app = new Koa();
  app.use(corsMiddleware(origin));
  app.use(errorHandler);
  app.use(async (ctx) => {
    reached();
    if (ctx.path === '/boom') throw new AppError('UNAUTHORIZED', 'nope');
    ctx.body = { ok: true };
  });
  server = createServer(app.callback());
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${init.path ?? '/'}`, {
    method: init.method ?? 'GET',
    headers: init.headers,
  });
}

describe('corsMiddleware', () => {
  it('没有 Origin 头时不写跨域头', async () => {
    const res = await call('*');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.status).toBe(200);
  });

  it("配置为 '*' 时放行任意源", async () => {
    const res = await call('*', { headers: { Origin: 'http://a.test' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('白名单命中时回写该源并带 Vary，且不发凭据头', async () => {
    const res = await call(['http://a.test', 'http://b.test'], {
      headers: { Origin: 'http://b.test' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://b.test');
    expect(res.headers.get('vary')).toContain('Origin');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('白名单未命中时不写跨域头', async () => {
    const res = await call('http://a.test', { headers: { Origin: 'http://evil.test' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('字符串配置支持逗号分隔多个源', async () => {
    const res = await call('http://a.test, http://b.test', {
      headers: { Origin: 'http://b.test' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://b.test');
  });

  it('预检返回 204 与方法、头、缓存时长，且不进入下游', async () => {
    const res = await call('http://a.test', {
      method: 'OPTIONS',
      headers: { Origin: 'http://a.test', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toBe(
      'GET, POST, PATCH, DELETE, OPTIONS',
    );
    expect(res.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
    expect(res.headers.get('access-control-max-age')).toBe('600');
    expect(reached).not.toHaveBeenCalled();
  });

  it('下游抛错时响应仍带跨域头', async () => {
    const res = await call('http://a.test', {
      path: '/boom',
      headers: { Origin: 'http://a.test' },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://a.test');
  });
});
