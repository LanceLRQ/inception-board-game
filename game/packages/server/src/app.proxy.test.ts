import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('./infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createApp, trustProxyFromEnv } from './app.js';

let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

/** 用限流中间件当探针，拿到应用看到的来源地址 */
async function seenIp(
  trustProxy: number | undefined,
  forwardedFor = '203.0.113.9',
): Promise<string> {
  let seen = '';
  const app = createApp({
    ...(trustProxy === undefined ? {} : { trustProxy }),
    rateLimit: async (ctx, next) => {
      seen = ctx.ip;
      await next();
    },
  });
  server = createServer(app.callback());
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'X-Forwarded-For': forwardedFor } });
  return seen;
}

describe('createApp 的反代信任', () => {
  it('开启后来源地址取 X-Forwarded-For', async () => {
    expect(await seenIp(1)).toBe('203.0.113.9');
  });

  it('只认反代追加的最后一个地址，客户端自带的伪造地址不生效', async () => {
    expect(await seenIp(1, '198.51.100.1, 203.0.113.9')).toBe('203.0.113.9');
  });

  it('前面有两层可信代理：取倒数第二个地址，客户端自带的伪造地址仍不生效', async () => {
    // 客户端 → 外层代理（追加客户端地址）→ 自带 nginx（追加外层代理地址）→ 后端
    expect(await seenIp(2, '198.51.100.1, 203.0.113.9, 10.0.0.5')).toBe('203.0.113.9');
  });

  it('默认不取 X-Forwarded-For，避免来源地址被伪造', async () => {
    expect(await seenIp(undefined)).not.toBe('203.0.113.9');
    expect(await seenIp(0)).not.toBe('203.0.113.9');
  });
});

describe('trustProxyFromEnv', () => {
  it('按可信代理层数解析，未设置、0 与非法值都是不信任', () => {
    expect(trustProxyFromEnv(undefined)).toBe(0);
    expect(trustProxyFromEnv('0')).toBe(0);
    expect(trustProxyFromEnv('1')).toBe(1);
    expect(trustProxyFromEnv('2')).toBe(2);
    expect(trustProxyFromEnv('true')).toBe(0);
    expect(trustProxyFromEnv('-1')).toBe(0);
    expect(trustProxyFromEnv('1.5')).toBe(0);
  });
});
