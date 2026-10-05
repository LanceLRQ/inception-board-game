import { afterEach, describe, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { startDevServer, type DevServer } from './devServer.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let dev: DevServer | null = null;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await dev?.stop();
  dev = null;
});

async function api<T>(
  base: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.status).toBeLessThan(300);
  return (await res.json()) as T;
}

function firstState(base: string, token: string, matchID: string): Promise<{ seat: string }> {
  return new Promise((resolve, reject) => {
    const socket = io(base, { path: '/ws', auth: { token, matchID }, transports: ['websocket'] });
    sockets.push(socket);
    socket.on('icg:state', (msg: { seat: string }) => resolve(msg));
    socket.on('connect_error', reject);
  });
}

describe('全内存开发服务', () => {
  it('建档、建房、加入、补 Bot、开始后，两个连接都收到首包', async () => {
    dev = await startDevServer({ port: 0 });
    const base = dev.url;

    const a = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '甲',
    });
    const b = await api<{ token: string }>(base, 'POST', '/identity/init', undefined, {
      nickname: '乙',
    });
    const room = await api<{ code: string }>(base, 'POST', '/rooms', a.token, { maxPlayers: 4 });
    await api(base, 'POST', `/rooms/${room.code}/join`, b.token);
    await api(base, 'POST', `/rooms/${room.code}/fill-ai`, a.token);
    const started = await api<{ matchId: string }>(
      base,
      'POST',
      `/rooms/${room.code}/start`,
      a.token,
    );

    const [sa, sb] = await Promise.all([
      firstState(base, a.token, started.matchId),
      firstState(base, b.token, started.matchId),
    ]);
    expect(new Set([sa.seat, sb.seat]).size).toBe(2);
  });
});
