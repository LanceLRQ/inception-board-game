import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('./infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createApp } from './app.js';

let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

/** 用限流中间件当探针，拿到应用看到的来源地址 */
async function seenIp(
  trustProxy: boolean | undefined,
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
    expect(await seenIp(true)).toBe('203.0.113.9');
  });

  it('只认反代追加的最后一个地址，客户端自带的伪造地址不生效', async () => {
    expect(await seenIp(true, '198.51.100.1, 203.0.113.9')).toBe('203.0.113.9');
  });

  it('默认不取 X-Forwarded-For，避免来源地址被伪造', async () => {
    expect(await seenIp(undefined)).not.toBe('203.0.113.9');
    expect(await seenIp(false)).not.toBe('203.0.113.9');
  });
});
