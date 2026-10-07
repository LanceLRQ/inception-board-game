// MatchSocket 单元测试：用假 socket 驱动，覆盖收包、去重、move 配对与断线重连

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MATCH_PROTOCOL_VERSION,
  type MatchEvent,
  type MatchViewState,
  type SeatInfo,
} from '@icgame/game-engine';
import { remainingSeconds } from '@/lib/deadlineClock';
import { subscribeIdentityRevoked } from '@/lib/identityRevoked';
import { MatchSocket, type SocketLike } from './matchSocket';

type Handler = (...args: unknown[]) => void;

class FakeSocket implements SocketLike {
  connected = false;
  handlers = new Map<string, Handler[]>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  connectCalls = 0;
  disconnectCalls = 0;

  on(event: string, handler: Handler): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }
  off(event: string, handler?: Handler): this {
    const list = this.handlers.get(event) ?? [];
    this.handlers.set(event, handler ? list.filter((h) => h !== handler) : []);
    return this;
  }
  emit(event: string, payload?: unknown): this {
    this.emitted.push({ event, payload });
    return this;
  }
  connect(): this {
    this.connectCalls += 1;
    return this;
  }
  disconnect(): this {
    this.disconnectCalls += 1;
    this.connected = false;
    return this;
  }
  /** 测试用：模拟服务端 / 底层触发事件 */
  fire(event: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(event) ?? []) h(...args);
  }
  sent(event: string): unknown[] {
    return this.emitted.filter((e) => e.event === event).map((e) => e.payload);
  }
}

const SEATS: SeatInfo[] = [
  { seat: '0', nickname: 'a', isBot: false, connected: true, takenOver: false },
  { seat: '1', nickname: 'b', isBot: true, connected: true, takenOver: false },
];

function view(stateID: number): MatchViewState {
  return {
    G: { n: stateID },
    ctx: {
      numPlayers: 2,
      playOrder: ['0', '1'],
      playOrderPos: 0,
      currentPlayer: '0',
      phase: 'play',
      turn: 1,
    },
    stateID,
  } as unknown as MatchViewState;
}

function snapshotMsg(type: 'icg:state' | 'icg:step', stateID: number, extra: object = {}) {
  return {
    type,
    protocol: MATCH_PROTOCOL_VERSION,
    matchID: 'm1',
    seat: '0',
    seats: SEATS,
    view: view(stateID),
    deadlineAt: 1_700_000_005_000,
    deadlineInMs: 5000,
    ...extra,
  };
}

function ev(stateID: number): MatchEvent {
  return { stateID, index: 1, type: 'x' } as unknown as MatchEvent;
}

describe('MatchSocket', () => {
  let socket: FakeSocket;
  let created: Array<{ url: string; opts: unknown }>;
  let ids: number;
  let ms: MatchSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
    created = [];
    ids = 0;
    ms = new MatchSocket({
      url: 'http://srv',
      token: 'tok',
      matchID: 'm1',
      createSocket: (url, opts) => {
        created.push({ url, opts });
        return socket;
      },
      moveTimeoutMs: 1000,
      now: () => 0,
      newIntentId: () => `i${++ids}`,
    });
  });
  afterEach(() => {
    ms.close();
    vi.useRealTimers();
  });

  function ready(stateID = 1): void {
    ms.connect();
    socket.connected = true;
    socket.fire('connect');
    socket.fire('icg:state', snapshotMsg('icg:state', stateID));
  }

  describe('倒计时的截止点', () => {
    /** 单调时钟与日历时间都可调的连接 */
    function withClocks(mono: { t: number }, wall: { t: number }): MatchSocket {
      const sock = new FakeSocket();
      const m = new MatchSocket({
        url: 'http://srv',
        token: 'tok',
        matchID: 'm1',
        createSocket: () => sock,
        now: () => mono.t,
        wallNow: () => wall.t,
      });
      m.connect();
      sock.connected = true;
      sock.fire('icg:state', snapshotMsg('icg:state', 1, { deadlineInMs: 30_000 }));
      sockets.set(m, sock);
      return m;
    }
    const sockets = new Map<MatchSocket, FakeSocket>();

    it('截止点 = 收到时刻的单调时钟 + 服务端给的剩余毫秒', () => {
      const m = withClocks({ t: 12_345 }, { t: 1_700_000_000_000 });
      expect(m.getSnapshot().deadlineAt).toBe(12_345 + 30_000);
      m.close();
    });

    it.each([
      ['本机时钟拨快 10 分钟', 10 * 60_000],
      ['本机时钟拨慢 10 分钟', -10 * 60_000],
    ])('%s：倒计时不受影响', (_name, skew) => {
      const mono = { t: 1_000 };
      const wall = { t: 1_700_000_000_000 + skew };
      const m = withClocks(mono, wall);
      const deadline = m.getSnapshot().deadlineAt;
      expect(remainingSeconds(deadline, mono.t)).toBe(30);
      mono.t += 12_000; // 过了 12 秒（日历时间被乱改也不影响单调时钟）
      wall.t -= 3_600_000;
      expect(remainingSeconds(deadline, mono.t)).toBe(18);
      mono.t += 20_000;
      expect(remainingSeconds(deadline, mono.t)).toBe(0);
      m.close();
    });

    it('下一条消息带来新的剩余毫秒时，以新消息为准', () => {
      const mono = { t: 0 };
      const m = withClocks(mono, { t: 0 });
      mono.t = 10_000;
      sockets
        .get(m)!
        .fire('icg:step', snapshotMsg('icg:step', 2, { events: [], deadlineInMs: 45_000 }));
      expect(m.getSnapshot().deadlineAt).toBe(55_000);
      m.close();
    });

    it('旧版服务端不带剩余毫秒时退回用日历时间换算', () => {
      const mono = { t: 2_000 };
      const wall = { t: 1_700_000_000_000 };
      const sock = new FakeSocket();
      const m = new MatchSocket({
        url: 'http://srv',
        token: 'tok',
        matchID: 'm1',
        createSocket: () => sock,
        now: () => mono.t,
        wallNow: () => wall.t,
      });
      m.connect();
      sock.connected = true;
      const legacy = snapshotMsg('icg:state', 1, { deadlineAt: 1_700_000_007_000 }) as Record<
        string,
        unknown
      >;
      delete legacy.deadlineInMs;
      sock.fire('icg:state', legacy);
      expect(m.getSnapshot().deadlineAt).toBe(2_000 + 7_000);
      m.close();
    });

    it('没有计时时截止点为 null', () => {
      const sock = new FakeSocket();
      const m = new MatchSocket({
        url: 'http://srv',
        token: 'tok',
        matchID: 'm1',
        createSocket: () => sock,
        now: () => 0,
      });
      m.connect();
      sock.connected = true;
      sock.fire('icg:state', snapshotMsg('icg:state', 1, { deadlineAt: null, deadlineInMs: null }));
      expect(m.getSnapshot().deadlineAt).toBeNull();
      m.close();
    });
  });

  it('connect 带上路径与握手参数并进入 connecting', () => {
    ms.connect();
    expect(created[0]?.url).toBe('http://srv');
    expect(created[0]?.opts).toMatchObject({ path: '/ws', auth: { token: 'tok', matchID: 'm1' } });
    expect(ms.getSnapshot().connection).toBe('connecting');
    expect(socket.connectCalls).toBe(1);
  });

  it('icg:state 到达后快照带上视图、座位、座位表与截止时间，状态为 connected', () => {
    ready(3);
    const s = ms.getSnapshot();
    expect(s.view?.stateID).toBe(3);
    expect(s.seat).toBe('0');
    expect(s.seats).toEqual(SEATS);
    expect(s.deadlineAt).toBe(5000);
    expect(s.connection).toBe('connected');
    expect(s.fatal).toBeNull();
  });

  it('内容不变时 getSnapshot 返回同一对象，变化时通知订阅者一次', () => {
    const listener = vi.fn();
    ms.subscribe(listener);
    ready(1);
    const a = ms.getSnapshot();
    expect(ms.getSnapshot()).toBe(a);
    const calls = listener.mock.calls.length;
    socket.fire('icg:step', snapshotMsg('icg:step', 2, { events: [] }));
    expect(listener.mock.calls.length).toBe(calls + 1);
    expect(ms.getSnapshot()).not.toBe(a);
  });

  it('协议版本不符时 fatal 为 PROTOCOL_MISMATCH，断开且不再重连', () => {
    ms.connect();
    socket.connected = true;
    socket.fire('icg:state', snapshotMsg('icg:state', 1, { protocol: MATCH_PROTOCOL_VERSION + 1 }));
    const s = ms.getSnapshot();
    expect(s.fatal).toBe('PROTOCOL_MISMATCH');
    expect(s.connection).toBe('failed');
    expect(s.view).toBeNull();
    expect(socket.disconnectCalls).toBe(1);
    socket.fire('disconnect', 'io client disconnect');
    expect(socket.connectCalls).toBe(1);
  });

  it('icg:step 的 stateID 不大于当前时丢弃视图与事件', () => {
    ready(5);
    const onEvents = vi.fn();
    ms.onEvents(onEvents);
    const before = ms.getSnapshot();
    socket.fire('icg:step', snapshotMsg('icg:step', 4, { events: [ev(4)] }));
    expect(ms.getSnapshot()).toBe(before);
    expect(onEvents).not.toHaveBeenCalled();
  });

  it('icg:step 漏了步（stateID 大 2 以上）仍采用视图并交出事件', () => {
    ready(1);
    const onEvents = vi.fn();
    ms.onEvents(onEvents);
    socket.fire('icg:step', snapshotMsg('icg:step', 4, { events: [ev(4)] }));
    expect(ms.getSnapshot().view?.stateID).toBe(4);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenCalledWith([ev(4)], 4);
    expect(socket.sent('icg:sync')).toHaveLength(0);
  });

  it('同一版本先收到 state 再收到 step：视图不重复更新，事件交出一次', () => {
    ready(2);
    const onEvents = vi.fn();
    ms.onEvents(onEvents);
    const before = ms.getSnapshot();
    socket.fire('icg:step', snapshotMsg('icg:step', 2, { events: [ev(2)] }));
    expect(ms.getSnapshot()).toBe(before);
    expect(onEvents).toHaveBeenCalledTimes(1);
    socket.fire('icg:step', snapshotMsg('icg:step', 2, { events: [ev(2)] }));
    expect(onEvents).toHaveBeenCalledTimes(1);
  });

  it('icg:seats 只更新座位表', () => {
    ready(1);
    const before = ms.getSnapshot();
    const next = [{ ...SEATS[0], connected: false }, SEATS[1]];
    socket.fire('icg:seats', { type: 'icg:seats', matchID: 'm1', seats: next });
    const s = ms.getSnapshot();
    expect(s.seats).toEqual(next);
    expect(s.view).toBe(before.view);
    expect(s.deadlineAt).toBe(before.deadlineAt);
  });

  it('icg:storage 不可用时置位、恢复后清除，视图与连接状态不受影响', () => {
    ready(1);
    const before = ms.getSnapshot();
    expect(before.storageDegraded).toBe(false);
    socket.fire('icg:storage', { type: 'icg:storage', matchID: 'm1', healthy: false });
    expect(ms.getSnapshot().storageDegraded).toBe(true);
    expect(ms.getSnapshot().view).toBe(before.view);
    expect(ms.getSnapshot().connection).toBe('connected');
    socket.fire('icg:storage', { type: 'icg:storage', matchID: 'm1', healthy: true });
    expect(ms.getSnapshot().storageDegraded).toBe(false);
  });

  it('断线时清除存储不可用提示', () => {
    ready(1);
    socket.fire('icg:storage', { type: 'icg:storage', matchID: 'm1', healthy: false });
    socket.connected = false;
    socket.fire('disconnect', 'transport close');
    expect(ms.getSnapshot().storageDegraded).toBe(false);
    expect(ms.getSnapshot().connection).toBe('reconnecting');
  });

  it('收到 MATCH_ABORTED：fatal 为 MATCH_ABORTED、failed，不再重连', () => {
    ready(1);
    socket.fire('icg:error', { type: 'icg:error', code: 'MATCH_ABORTED', message: 'x' });
    expect(ms.getSnapshot().fatal).toBe('MATCH_ABORTED');
    expect(ms.getSnapshot().connection).toBe('failed');
    socket.connected = false;
    socket.fire('disconnect', 'io server disconnect');
    expect(socket.connectCalls).toBe(1);
  });

  it('sendMove 发出带新 intentId 与当前 stateID 的 icg:move，收到结果后完成', async () => {
    ready(7);
    const p = ms.sendMove('play', [1, 2]);
    expect(socket.sent('icg:move')).toEqual([
      { type: 'icg:move', move: 'play', args: [1, 2], intentId: 'i1', stateID: 7 },
    ]);
    socket.fire('icg:moveResult', { type: 'icg:moveResult', intentId: 'i1', ok: true, stateID: 8 });
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('sendMove 被拒时带 code；忽略未知 intentId', async () => {
    ready(1);
    const p = ms.sendMove('play');
    socket.fire('icg:moveResult', {
      type: 'icg:moveResult',
      intentId: 'zzz',
      ok: true,
      stateID: 2,
    });
    socket.fire('icg:moveResult', {
      type: 'icg:moveResult',
      intentId: 'i1',
      ok: false,
      code: 'stale_state',
    });
    await expect(p).resolves.toEqual({ ok: false, code: 'stale_state' });
  });

  it('没有视图或未连接时 sendMove 立即返回 not_ready 且不发包', async () => {
    ms.connect();
    await expect(ms.sendMove('play')).resolves.toEqual({ ok: false, code: 'not_ready' });
    ready(1);
    socket.connected = false;
    socket.fire('disconnect', 'transport close');
    await expect(ms.sendMove('play')).resolves.toEqual({ ok: false, code: 'not_ready' });
    expect(socket.sent('icg:move')).toHaveLength(0);
  });

  it('sendMove 超时返回 timeout 并触发一次 requestSync', async () => {
    ready(1);
    const p = ms.sendMove('play');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toEqual({ ok: false, code: 'timeout' });
    expect(socket.sent('icg:sync')).toHaveLength(1);
  });

  it('resume 发出一条不带座位的 icg:resume；未连接或已关闭时不发', () => {
    ms.resume();
    expect(socket.sent('icg:resume')).toHaveLength(0);

    ready();
    ms.resume();
    expect(socket.sent('icg:resume')).toEqual([{ type: 'icg:resume' }]);

    ms.close();
    ms.resume();
    expect(socket.sent('icg:resume')).toHaveLength(1);
  });

  it('托管解除后服务端发来的座位表更新快照', () => {
    ready();
    const taken = SEATS.map((s) => (s.seat === '0' ? { ...s, takenOver: true } : s));
    socket.fire('icg:seats', { type: 'icg:seats', matchID: 'm1', seats: taken });
    expect(ms.getSnapshot().seats[0]!.takenOver).toBe(true);
    socket.fire('icg:seats', { type: 'icg:seats', matchID: 'm1', seats: SEATS });
    expect(ms.getSnapshot().seats[0]!.takenOver).toBe(false);
  });

  describe('预设短语', () => {
    const chatMsg = (sender: string, phraseId: string) => ({
      type: 'icg:chatMessage',
      matchID: 'm1',
      message: { sender, text: '服务端附带的文案', phraseId, sentAt: 1_700_000_000_000 },
    });

    it('收到的短语进入快照，带发送座位与本机单调时钟的收到时刻', () => {
      let t = 500;
      const sock = new FakeSocket();
      const m = new MatchSocket({
        url: 'http://srv',
        token: 'tok',
        matchID: 'm1',
        createSocket: () => sock,
        now: () => t,
      });
      m.connect();
      sock.connected = true;
      sock.fire('icg:state', snapshotMsg('icg:state', 1));
      sock.fire('icg:chatMessage', chatMsg('1', 'greet_hi'));
      t = 900;
      sock.fire('icg:chatMessage', chatMsg('0', 'emotion_gg'));
      expect(m.getSnapshot().chat).toEqual([
        { id: 1, seat: '1', presetId: 'greet_hi', at: 500 },
        { id: 2, seat: '0', presetId: 'emotion_gg', at: 900 },
      ]);
      m.close();
    });

    it('不在预设里的短语、畸形消息一律忽略（界面不会出现任意文本）', () => {
      ready();
      socket.fire('icg:chatMessage', chatMsg('1', '大家好，加我'));
      socket.fire('icg:chatMessage', { message: null });
      socket.fire('icg:chatMessage', 'x');
      expect(ms.getSnapshot().chat).toEqual([]);
    });

    it('历史只留最近 30 条', () => {
      ready();
      for (let i = 0; i < 35; i++) socket.fire('icg:chatMessage', chatMsg('1', 'greet_hi'));
      const chat = ms.getSnapshot().chat;
      expect(chat).toHaveLength(30);
      expect(chat[0]!.id).toBe(6);
    });

    it('sendChat 发出只带短语 id 的 icg:chatBroadcast', () => {
      ready();
      expect(ms.sendChat('greet_hi')).toBe(true);
      expect(socket.sent('icg:chatBroadcast')).toEqual([
        { type: 'icg:chatBroadcast', scope: 'match', message: 'greet_hi' },
      ]);
    });

    it('sendChat 拒发：不在预设里的 id、没连上、已关闭', () => {
      ms.connect();
      expect(ms.sendChat('greet_hi')).toBe(false);
      socket.connected = true;
      socket.fire('icg:state', snapshotMsg('icg:state', 1));
      expect(ms.sendChat('随便写点什么')).toBe(false);
      ms.close();
      expect(ms.sendChat('greet_hi')).toBe(false);
      expect(socket.sent('icg:chatBroadcast')).toEqual([]);
    });

    it('close 之后不再收短语', () => {
      ready();
      ms.close();
      socket.fire('icg:chatMessage', chatMsg('1', 'greet_hi'));
      expect(ms.getSnapshot().chat).toEqual([]);
    });
  });

  it('requestSync 只发一次 icg:sync', () => {
    ready(1);
    ms.requestSync();
    expect(socket.sent('icg:sync')).toHaveLength(1);
  });

  it('断线后变 reconnecting，等待中的 move 以 timeout 完成，重连收到 state 后恢复', async () => {
    ready(1);
    const p = ms.sendMove('play');
    socket.connected = false;
    socket.fire('disconnect', 'transport close');
    expect(ms.getSnapshot().connection).toBe('reconnecting');
    await expect(p).resolves.toEqual({ ok: false, code: 'timeout' });
    socket.connected = true;
    socket.fire('connect');
    socket.fire('icg:state', snapshotMsg('icg:state', 3));
    expect(ms.getSnapshot().connection).toBe('connected');
    expect(ms.getSnapshot().view?.stateID).toBe(3);
  });

  it('带 reset 的 icg:state 即使版本号更小也接受，之后的 step 照常推进', () => {
    ready(5);
    socket.fire('icg:state', snapshotMsg('icg:state', 3));
    expect(ms.getSnapshot().view?.stateID).toBe(5);
    socket.fire('icg:state', snapshotMsg('icg:state', 3, { reset: true }));
    expect(ms.getSnapshot().view?.stateID).toBe(3);
    const seen: number[] = [];
    ms.onEvents((_events, stateID) => seen.push(stateID));
    socket.fire('icg:step', snapshotMsg('icg:step', 4, { events: [] }));
    expect(ms.getSnapshot().view?.stateID).toBe(4);
    expect(seen).toEqual([4]);
  });

  it('服务端主动断开（非被替换）时重新 connect', () => {
    ready(1);
    socket.connected = false;
    socket.fire('disconnect', 'io server disconnect');
    expect(socket.connectCalls).toBe(2);
    expect(ms.getSnapshot().connection).toBe('reconnecting');
  });

  it.each(['AUTH_REQUIRED', 'AUTH_INVALID', 'TOKEN_REVOKED', 'NOT_IN_MATCH'])(
    '握手被拒 %s：fatal 置位、failed、停止重连',
    (code) => {
      ms.connect();
      socket.fire('connect_error', new Error(code));
      const s = ms.getSnapshot();
      expect(s.fatal).toBe(code);
      expect(s.connection).toBe('failed');
      expect(socket.disconnectCalls).toBe(1);
    },
  );

  it('令牌被作废：握手被拒时通知身份失效，带上本连接用的令牌', () => {
    const seen: Array<string | null> = [];
    const off = subscribeIdentityRevoked((t) => seen.push(t));
    try {
      ms.connect();
      socket.fire('connect_error', new Error('TOKEN_REVOKED'));
    } finally {
      off();
    }
    expect(seen).toEqual(['tok']);
  });

  it('令牌被作废：已连上后收到 icg:error 同样 fatal、failed 并通知身份失效', () => {
    const seen: Array<string | null> = [];
    const off = subscribeIdentityRevoked((t) => seen.push(t));
    try {
      ready(1);
      socket.fire('icg:error', { type: 'icg:error', code: 'TOKEN_REVOKED', message: 'x' });
    } finally {
      off();
    }
    expect(ms.getSnapshot().fatal).toBe('TOKEN_REVOKED');
    expect(ms.getSnapshot().connection).toBe('failed');
    expect(seen).toEqual(['tok']);
  });

  it('其他握手拒绝不通知身份失效', () => {
    const seen: Array<string | null> = [];
    const off = subscribeIdentityRevoked((t) => seen.push(t));
    try {
      ms.connect();
      socket.fire('connect_error', new Error('NOT_IN_MATCH'));
    } finally {
      off();
    }
    expect(seen).toEqual([]);
  });

  it('其他 connect_error 不置 fatal，保持重连', () => {
    ms.connect();
    socket.fire('connect_error', new Error('xhr poll error'));
    expect(ms.getSnapshot().fatal).toBeNull();
    expect(ms.getSnapshot().connection).not.toBe('failed');
  });

  it('首次连接就失败：进入 reconnecting，横幅与退出按钮才有机会出现', () => {
    ms.connect();
    expect(ms.getSnapshot().connection).toBe('connecting');
    socket.fire('connect_error', new Error('xhr poll error'));
    expect(ms.getSnapshot().connection).toBe('reconnecting');
    expect(ms.getSnapshot().fatal).toBeNull();
  });

  it('收到 REPLACED：fatal 为 REPLACED、failed，之后断开也不再重连', () => {
    ready(1);
    socket.fire('icg:error', { type: 'icg:error', code: 'REPLACED', message: 'x' });
    expect(ms.getSnapshot().fatal).toBe('REPLACED');
    expect(ms.getSnapshot().connection).toBe('failed');
    socket.connected = false;
    socket.fire('disconnect', 'io server disconnect');
    expect(socket.connectCalls).toBe(1);
    expect(ms.getSnapshot().connection).toBe('failed');
  });

  it('close 之后不再触发订阅与事件监听，并断开 socket', () => {
    ready(1);
    const listener = vi.fn();
    const onEvents = vi.fn();
    ms.subscribe(listener);
    ms.onEvents(onEvents);
    ms.close();
    expect(socket.disconnectCalls).toBeGreaterThan(0);
    socket.fire('icg:step', snapshotMsg('icg:step', 9, { events: [ev(9)] }));
    socket.fire('disconnect', 'io client disconnect');
    expect(listener).not.toHaveBeenCalled();
    expect(onEvents).not.toHaveBeenCalled();
  });

  it('close 时等待中的 move 以 not_ready 完成', async () => {
    ready(1);
    const p = ms.sendMove('play');
    ms.close();
    await expect(p).resolves.toEqual({ ok: false, code: 'not_ready' });
  });
});
