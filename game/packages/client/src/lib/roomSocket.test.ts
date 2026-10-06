// 房间推送连接：用假 socket 驱动

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocketLike } from '../match/matchSocket';
import type { RoomState } from './roomApi';
import { ROOM_EVENT, RoomSocket, parseRoomMessage, type RoomPushStatus } from './roomSocket';

vi.mock('./logger', () => ({
  logger: { flow: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Handler = (...args: unknown[]) => void;

class FakeSocket implements SocketLike {
  connected = false;
  connectCalls = 0;
  disconnectCalls = 0;
  private readonly handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  off(event: string): this {
    this.handlers.delete(event);
    return this;
  }
  emit(): this {
    return this;
  }
  connect(): this {
    this.connectCalls += 1;
    return this;
  }
  disconnect(): this {
    this.disconnectCalls += 1;
    return this;
  }
  fire(event: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }
}

function room(over: Partial<RoomState> = {}): RoomState {
  return {
    id: 'r1',
    code: 'ABC234',
    ownerPlayerId: 'p1',
    maxPlayers: 6,
    ruleVariant: 'classic',
    status: 'waiting',
    players: [],
    ...over,
  };
}

describe('parseRoomMessage', () => {
  it('取出消息里的房间', () => {
    expect(parseRoomMessage({ type: ROOM_EVENT, room: room() })?.code).toBe('ABC234');
  });

  it.each([
    null,
    undefined,
    'x',
    {},
    { room: null },
    { room: { code: 1, players: [] } },
    { room: { code: 'A' } },
  ])('形状不对返回 null：%j', (msg) => {
    expect(parseRoomMessage(msg)).toBeNull();
  });
});

describe('RoomSocket', () => {
  let socket: FakeSocket;
  let created: Array<{ url: string; opts: unknown }>;
  let rooms: RoomState[];
  let statuses: RoomPushStatus[];
  let removed: number;
  let rs: RoomSocket;

  beforeEach(() => {
    socket = new FakeSocket();
    created = [];
    rooms = [];
    statuses = [];
    removed = 0;
    rs = new RoomSocket({
      url: 'http://srv',
      token: 'tok',
      code: 'ABC234',
      createSocket: (url, opts) => {
        created.push({ url, opts });
        return socket;
      },
      onRoom: (r) => rooms.push(r),
      onStatus: (s) => statuses.push(s),
      onRemoved: () => {
        removed += 1;
      },
    });
  });

  it('connect 带上路径与握手参数，进入 connecting', () => {
    rs.connect();
    expect(created[0]?.url).toBe('http://srv');
    expect(created[0]?.opts).toMatchObject({ path: '/ws', auth: { token: 'tok', code: 'ABC234' } });
    expect(socket.connectCalls).toBe(1);
    expect(statuses).toEqual(['connecting']);
    // 重复 connect 不会再建连接
    rs.connect();
    expect(created).toHaveLength(1);
  });

  it('收到第一份房间状态才算推送可用，之后每份都交给回调', () => {
    rs.connect();
    socket.fire('connect');
    expect(rs.getStatus()).toBe('connecting');
    socket.fire(ROOM_EVENT, { type: ROOM_EVENT, room: room() });
    expect(rs.getStatus()).toBe('connected');
    socket.fire(ROOM_EVENT, { type: ROOM_EVENT, room: room({ status: 'playing', matchId: 'm1' }) });
    expect(rooms).toHaveLength(2);
    expect(rooms[1]!.matchId).toBe('m1');
    expect(statuses).toEqual(['connecting', 'connected']);
  });

  it('形状不对的消息被忽略', () => {
    rs.connect();
    socket.fire(ROOM_EVENT, { nope: true });
    expect(rooms).toHaveLength(0);
    expect(rs.getStatus()).toBe('connecting');
  });

  it('断线后状态变 down（交给轮询兜底），重新收到状态后恢复', () => {
    rs.connect();
    socket.fire(ROOM_EVENT, { room: room() });
    socket.fire('disconnect', 'transport close');
    expect(rs.getStatus()).toBe('down');
    socket.fire(ROOM_EVENT, { room: room() });
    expect(rs.getStatus()).toBe('connected');
  });

  it('服务端主动断开时重新连接', () => {
    rs.connect();
    socket.fire('disconnect', 'io server disconnect');
    expect(socket.connectCalls).toBe(2);
  });

  it('握手被拒：状态 down，并主动断开不再重试', () => {
    rs.connect();
    socket.fire('connect_error', new Error('NOT_IN_ROOM'));
    expect(rs.getStatus()).toBe('down');
    expect(socket.disconnectCalls).toBe(1);
  });

  it('网络类的连接错误：状态 down，但不放弃（底层继续重连）', () => {
    rs.connect();
    socket.fire('connect_error', new Error('xhr poll error'));
    expect(rs.getStatus()).toBe('down');
    expect(socket.disconnectCalls).toBe(0);
  });

  it('服务端告知已不在房间：回调 onRemoved、断开且之后的消息被忽略', () => {
    rs.connect();
    socket.fire(ROOM_EVENT, { room: room() });
    socket.fire('icg:error', { code: 'NOT_IN_ROOM' });
    expect(removed).toBe(1);
    expect(rs.getStatus()).toBe('down');
    expect(socket.disconnectCalls).toBe(1);
    socket.fire(ROOM_EVENT, { room: room() });
    expect(rooms).toHaveLength(1);
  });

  it('其他服务端错误只记日志', () => {
    rs.connect();
    socket.fire('icg:error', { code: 'INTERNAL_ERROR' });
    expect(removed).toBe(0);
  });

  it('close 之后不再处理任何事件，也不会再连', () => {
    rs.connect();
    rs.close();
    expect(socket.disconnectCalls).toBe(1);
    socket.fire(ROOM_EVENT, { room: room() });
    expect(rooms).toHaveLength(0);
    rs.connect();
    expect(created).toHaveLength(1);
    expect(rs.getStatus()).toBe('idle');
  });
});
