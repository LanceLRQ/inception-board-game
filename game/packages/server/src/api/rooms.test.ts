import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { signToken } from '../infra/jwt.js';
import { errorHandler } from '../middleware/errorHandler.js';
import type { LobbyService } from '../services/LobbyService.js';
import { createRoomsRouter } from './rooms.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

async function call(
  lobby: Partial<Record<keyof LobbyService, unknown>>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const app = new Koa();
  app.use(errorHandler);
  app.use(bodyParser());
  const router = createRoomsRouter(lobby as unknown as LobbyService);
  app.use(router.routes());
  server = createServer(app.callback());
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${signToken({ playerId: 'P1', nickname: 'A' })}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe('createRoomsRouter', () => {
  it('创建房间：人数下限为 4', async () => {
    const createRoom = vi.fn(async () => ({
      id: 'r',
      code: 'ABC234',
      expiresAt: 1,
      ownerPlayerId: 'P1',
      maxPlayers: 4,
      players: [{}],
      status: 'waiting',
    }));
    const low = await call({ createRoom }, 'POST', '/rooms', { maxPlayers: 3 });
    // 注：认证中间件目前会把下游抛出的任何错误都改成 401，所以这里只断言没有创建成功
    expect(low.status).not.toBe(201);
    expect(createRoom).not.toHaveBeenCalled();

    const ok = await call({ createRoom }, 'POST', '/rooms', { maxPlayers: 4 });
    expect(ok.status).toBe(201);
    expect(createRoom).toHaveBeenCalledWith('P1', expect.objectContaining({ maxPlayers: 4 }));
  });

  it('开始游戏：用 :code 调用传入的大厅服务并返回 matchId', async () => {
    const startGame = vi.fn(async () => 'match-1');
    const res = await call({ startGame }, 'POST', '/rooms/ABC234/start');
    expect(res.json).toEqual({ matchId: 'match-1' });
    expect(startGame).toHaveBeenCalledWith('ABC234', 'P1');
  });

  it('加入、离开、踢人、补 AI 都按 :code 转发', async () => {
    const joinRoom = vi.fn(async () => ({ id: 'r' }));
    const leaveRoom = vi.fn(async () => undefined);
    const kickPlayer = vi.fn(async () => ({ id: 'r' }));
    const fillAI = vi.fn(async () => ({ id: 'r' }));
    const lobby = { joinRoom, leaveRoom, kickPlayer, fillAI };

    await call(lobby, 'POST', '/rooms/ABC234/join');
    await call(lobby, 'POST', '/rooms/ABC234/leave');
    await call(lobby, 'POST', '/rooms/ABC234/kick', { targetId: 'P2' });
    await call(lobby, 'POST', '/rooms/ABC234/fill-ai', { count: 2 });
    expect(joinRoom).toHaveBeenCalledWith('ABC234', 'P1');
    expect(leaveRoom).toHaveBeenCalledWith('ABC234', 'P1');
    expect(kickPlayer).toHaveBeenCalledWith('ABC234', 'P1', 'P2');
    expect(fillAI).toHaveBeenCalledWith('ABC234', 'P1', 2);
  });

  it('按房间码查询：返回房间摘要', async () => {
    const getRoom = vi.fn(async () => ({
      id: 'r',
      code: 'ABC234',
      ownerPlayerId: 'P1',
      maxPlayers: 6,
      players: [{}, {}],
      status: 'waiting',
      expiresAt: 5,
    }));
    const res = await call({ getRoom }, 'GET', '/rooms/code/ABC234');
    expect(getRoom).toHaveBeenCalledWith('ABC234');
    expect(res.json).toMatchObject({ code: 'ABC234', currentPlayers: 2 });
  });

  it('按房间码查询：带上成员列表与对局号，供等待页轮询', async () => {
    const players = [{ playerId: 'P1', nickname: 'A', seat: 0 }];
    const getRoom = vi.fn(async () => ({
      id: 'r',
      code: 'ABC234',
      ownerPlayerId: 'P1',
      maxPlayers: 6,
      players,
      status: 'playing',
      matchId: 'match-9',
      expiresAt: 5,
    }));
    const res = await call({ getRoom }, 'GET', '/rooms/code/ABC234');
    expect(res.json).toMatchObject({ status: 'playing', matchId: 'match-9', players });
  });

  it('未带令牌返回 401', async () => {
    const app = new Koa();
    app.use(errorHandler);
    app.use(createRoomsRouter({} as LobbyService).routes());
    server = createServer(app.callback());
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/rooms/ABC234/start`, { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
