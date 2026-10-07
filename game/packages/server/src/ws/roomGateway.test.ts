// 房间推送：握手只放行房间成员；变化只推给本房间的成员；被移出的连接会被断开

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as IOServer } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { signToken } from '../infra/jwt.js';
import type { RoomPlayer, RoomState } from '../services/LobbyService.js';
import {
  MAX_ROOM_CONNECTIONS_PER_PLAYER,
  ROOM_EVENT,
  RoomGateway,
  authorizeRoomHandshake,
  roomChannel,
} from './roomGateway.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function member(playerId: string, seat: number, isBot = false): RoomPlayer {
  return { playerId, nickname: `昵称-${playerId}`, avatarSeed: 's', seat, isBot, joinedAt: 1 };
}

function makeRoom(over: Partial<RoomState> = {}): RoomState {
  return {
    id: 'room-id',
    code: 'ABC234',
    ownerPlayerId: 'p1',
    maxPlayers: 6,
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    status: 'waiting',
    players: [member('p1', 0), member('p2', 1)],
    createdAt: 1,
    expiresAt: 2,
    ...over,
  };
}

function token(playerId: string): string {
  return signToken({ playerId, nickname: playerId, tokenVersion: 0 });
}

describe('authorizeRoomHandshake', () => {
  const base = {
    verifyToken: (t: string) => {
      if (t === 'bad') throw new Error('bad');
      return { playerId: t, tokenVersion: 0 };
    },
    bans: {
      isBanned: async (id: string) => id === 'banned',
      isTokenCurrent: async (id: string, v: number) => (id === 'recovered' ? v === 1 : v === 0),
    },
    getRoom: async (code: string) => (code === 'ABC234' ? makeRoom() : null),
  };

  it('成员通过，返回房间', async () => {
    const res = await authorizeRoomHandshake({ token: 'p1', code: 'abc234' }, base);
    expect(res).toMatchObject({ ok: true, playerID: 'p1' });
  });

  it.each([
    ['没有 auth', null, 'AUTH_REQUIRED'],
    ['没有令牌', { code: 'ABC234' }, 'AUTH_REQUIRED'],
    ['房间码格式不对', { token: 'p1', code: 'ABC' }, 'AUTH_REQUIRED'],
    ['令牌无效', { token: 'bad', code: 'ABC234' }, 'AUTH_INVALID'],
    ['令牌版本已作废', { token: 'recovered', code: 'ABC234' }, 'TOKEN_REVOKED'],
    ['账号被封禁', { token: 'banned', code: 'ABC234' }, 'BANNED'],
    ['不是成员', { token: 'p9', code: 'ABC234' }, 'NOT_IN_ROOM'],
    ['房间不存在', { token: 'p1', code: 'ZZZ999' }, 'NOT_IN_ROOM'],
  ])('%s → 拒绝', async (_name, auth, error) => {
    expect(await authorizeRoomHandshake(auth, base)).toEqual({ ok: false, error });
  });
});

describe('RoomGateway（真实 socket）', () => {
  const clients: ClientSocket[] = [];
  let http: HttpServer | null = null;
  let io: IOServer | null = null;

  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await io?.close();
    io = null;
    http = null;
  });

  async function boot(room: { current: RoomState | null }) {
    http = createServer();
    io = new IOServer(http, { path: '/ws' });
    const gateway = new RoomGateway({
      bans: { isBanned: async () => false, isTokenCurrent: async () => true },
      getRoom: async () => room.current,
    });
    gateway.attach(io);
    await new Promise<void>((resolve) => http!.listen(0, resolve));
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/rooms`;
    return { gateway, url };
  }

  function connect(url: string, playerId: string, code = 'ABC234') {
    const socket = connectClient(url, {
      path: '/ws',
      auth: { token: token(playerId), code },
      transports: ['websocket'],
      reconnection: false,
    });
    clients.push(socket);
    const received: unknown[] = [];
    socket.on(ROOM_EVENT, (msg: unknown) => received.push(msg));
    const errors: unknown[] = [];
    socket.on('icg:error', (msg: unknown) => errors.push(msg));
    return { socket, received, errors };
  }

  async function until(cond: () => boolean): Promise<void> {
    const deadline = Date.now() + 3000;
    while (!cond()) {
      if (Date.now() > deadline) throw new Error('等待超时');
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  it('连上后立即收到最新房间状态，内容只含房间公开信息', async () => {
    const holder = { current: makeRoom({ matchId: 'm1', status: 'playing' }) as RoomState | null };
    const { url } = await boot(holder);
    const c = connect(url, 'p1');
    await until(() => c.received.length === 1);
    const msg = c.received[0] as { type: string; room: Record<string, unknown> };
    expect(msg.type).toBe(ROOM_EVENT);
    expect(msg.room).toMatchObject({ code: 'ABC234', status: 'playing', matchId: 'm1' });
    const text = JSON.stringify(msg);
    expect(text).not.toContain('exCardsEnabled');
    expect(text).not.toContain('expiresAt');
  });

  it('非成员的握手被拒', async () => {
    const holder = { current: makeRoom() as RoomState | null };
    const { url } = await boot(holder);
    const c = connect(url, 'outsider');
    const err = await new Promise<Error>((resolve) => c.socket.on('connect_error', resolve));
    expect(err.message).toBe('NOT_IN_ROOM');
  });

  it('publish 只推给本房间的成员，别的房间的连接收不到', async () => {
    const holder = { current: makeRoom() as RoomState | null };
    const { gateway, url } = await boot(holder);
    const a = connect(url, 'p1');
    const b = connect(url, 'p2');
    await until(() => a.received.length === 1 && b.received.length === 1);

    // 另一个房间的成员（同一个服务上）
    holder.current = makeRoom({ code: 'OTHER9', players: [member('p3', 0)] });
    const other = connect(url, 'p3', 'OTHER9');
    await until(() => other.received.length === 1);
    holder.current = makeRoom();

    gateway.publish(
      makeRoom({ players: [member('p1', 0), member('p2', 1), member('bot-1', 2, true)] }),
    );
    await until(() => a.received.length === 2 && b.received.length === 2);
    const last = b.received[1] as { room: { players: unknown[] } };
    expect(last.room.players).toHaveLength(3);
    expect(other.received).toHaveLength(1);
  });

  it('被移出成员的连接收到错误并被断开，不再收到推送', async () => {
    const holder = { current: makeRoom() as RoomState | null };
    const { gateway, url } = await boot(holder);
    const a = connect(url, 'p1');
    const b = connect(url, 'p2');
    await until(() => a.received.length === 1 && b.received.length === 1);

    gateway.publish(makeRoom({ players: [member('p1', 0)] }));
    await until(() => !b.socket.connected);
    expect(b.errors[0]).toMatchObject({ code: 'NOT_IN_ROOM' });
    expect(b.received).toHaveLength(1);
    await until(() => a.received.length === 2);
  });

  it('同一个人的并发连接超过上限时断开最旧的', async () => {
    const holder = { current: makeRoom() as RoomState | null };
    const { url } = await boot(holder);
    const opened = Array.from({ length: MAX_ROOM_CONNECTIONS_PER_PLAYER + 1 }, () =>
      connect(url, 'p1'),
    );
    await until(
      () =>
        opened.filter((c) => c.socket.connected).length === MAX_ROOM_CONNECTIONS_PER_PLAYER &&
        opened.filter((c) => c.socket.disconnected).length === 1,
    );
  });

  it('disconnectPlayer：只断开该账号的房间连接，先发带原因的错误；其他人不受影响', async () => {
    const holder = { current: makeRoom() as RoomState | null };
    const { gateway, url } = await boot(holder);
    const a1 = connect(url, 'p1');
    const a2 = connect(url, 'p1');
    const b = connect(url, 'p2');
    await until(() => [a1, a2, b].every((c) => c.received.length > 0));

    expect(gateway.disconnectPlayer('p1', 'TOKEN_REVOKED', 'recovered elsewhere')).toBe(2);
    await until(() => a1.socket.disconnected && a2.socket.disconnected);
    expect(a1.errors).toContainEqual(expect.objectContaining({ code: 'TOKEN_REVOKED' }));
    expect(a2.errors).toContainEqual(expect.objectContaining({ code: 'TOKEN_REVOKED' }));
    expect(b.socket.connected).toBe(true);
    expect(gateway.disconnectPlayer('nobody')).toBe(0);
  });

  it('disconnectPlayer 不带原因时按封禁处理', async () => {
    const holder = { current: makeRoom() as RoomState | null };
    const { gateway, url } = await boot(holder);
    const a = connect(url, 'p1');
    await until(() => a.received.length > 0);
    gateway.disconnectPlayer('p1');
    await until(() => a.socket.disconnected);
    expect(a.errors).toContainEqual(expect.objectContaining({ code: 'BANNED' }));
  });

  it('roomChannel 对房间码大小写不敏感', () => {
    expect(roomChannel('abc234')).toBe(roomChannel('ABC234'));
  });
});
