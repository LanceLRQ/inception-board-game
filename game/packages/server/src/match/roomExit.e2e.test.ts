import { afterEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '../infra/jwt.js';
import type { LobbyRedis } from '../services/LobbyService.js';
import {
  connect,
  makeRoom,
  startServer,
  tryConnect,
  waitUntil,
  type TestClient,
  type TestServer,
} from '../testing/matchHarness.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
let server: TestServer;
const clients: TestClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.stop();
});

async function setup() {
  const { room, accounts } = makeRoom({ humans: 2, bots: 2 });
  room.matchId = room.id;
  const values = new Map([[`ico:room:${room.code}`, JSON.stringify(room)]]);
  const redis: LobbyRedis = {
    get: async (key) => values.get(key) ?? null,
    setex: async (key, _ttl, value) => {
      values.set(key, value);
      return 'OK';
    },
    set: async (key, value) => {
      if (values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    del: async (key) => Number(values.delete(key)),
    exists: async (key) => Number(values.has(key)),
  };
  server = await startServer({
    lobbyRedis: redis,
    timing: { turnTimeoutMs: 60_000, pendingTimeoutMs: 60_000, botStepDelayMs: 20 },
  });
  await server.rt.matches.createFromRoom(room);
  for (const account of accounts) clients.push(await connect(server, account, room.id));
  const token = (index: number) => signToken({ ...accounts[index]!, tokenVersion: 0 });
  const request = (index: number, action: string) =>
    fetch(`${server.url}/rooms/${room.code}/${action}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token(index)}` },
    });
  return { room, accounts, token, request };
}

describe('房主结束与成员退出：真实 HTTP + Socket', () => {
  it('非房主被拒，房主结束后全体收到通知、断开且不能重连，历史保留', async () => {
    const { room, token, request } = await setup();
    expect((await request(1, 'end')).status).toBe(403);
    expect(server.rt.matches.isRunning(room.id)).toBe(true);
    expect((await request(0, 'end')).status).toBe(200);
    await waitUntil(() => clients.every((c) => !c.connected), '全体连接断开');
    for (const c of clients) {
      expect(c.received).toContainEqual({
        event: 'icg:error',
        payload: expect.objectContaining({ code: 'MATCH_ENDED_BY_HOST' }),
      });
    }
    expect(await server.store.listActive()).toEqual([]);
    expect((await server.archive.matchInfo(room.id))?.endedAt).toBeInstanceOf(Date);
    expect(await tryConnect(server.url, token(1), room.id)).toEqual({
      ok: false,
      reason: 'NOT_IN_MATCH',
    });
    expect((await request(0, 'end')).status).toBe(200);
  });

  it('退出只断开本人并立即接管，另一位玩家的连接和对局继续', async () => {
    const { room, accounts, token, request } = await setup();
    expect((await request(1, 'leave')).status).toBe(200);
    await waitUntil(() => !clients[1]!.connected, '退出者断开');
    expect(clients[0]!.connected).toBe(true);
    expect(server.rt.matches.isRunning(room.id)).toBe(true);
    expect(server.rt.matches.seatOf(room.id, accounts[1]!.playerId)).toBeNull();
    await waitUntil(
      () => clients[0]!.seatTables.some((t) => t.seats.some((s) => s.seat === '1' && s.takenOver)),
      '其他玩家收到接管状态',
    );
    expect(await tryConnect(server.url, token(1), room.id)).toEqual({
      ok: false,
      reason: 'NOT_IN_MATCH',
    });
    expect(
      (await server.rt.lobby.getRoom(room.code))?.players.some(
        (p) => p.playerId === accounts[1]!.playerId,
      ),
    ).toBe(false);
  });
});
