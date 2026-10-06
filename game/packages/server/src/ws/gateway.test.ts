import { describe, it, expect, vi } from 'vitest';
import { InceptionCityGame } from '@icgame/game-engine';
import { createMatch } from '@icgame/game-engine/runner';
import { MatchRoom } from '../match/MatchRoom.js';
import type { MatchService } from '../match/MatchService.js';
import { SocketGateway, normalizeInbound } from './gateway.js';
import type { ConnectionRegistry } from './connectionRegistry.js';

describe('normalizeInbound', () => {
  describe('fully-formed ClientMessage passthrough', () => {
    it('preserves payload when type matches event', () => {
      const msg = { type: 'icg:heartbeat', at: 123 };
      expect(normalizeInbound('icg:heartbeat', msg)).toEqual(msg);
    });

    it('preserves a chat broadcast message', () => {
      const msg = { type: 'icg:chatBroadcast', scope: 'match', message: 'greet_hi' };
      expect(normalizeInbound('icg:chatBroadcast', msg)).toEqual(msg);
    });
  });

  describe('heartbeat fallback', () => {
    it('builds a fresh heartbeat message from plain payload', () => {
      const result = normalizeInbound('icg:heartbeat', {});
      expect(result?.type).toBe('icg:heartbeat');
      if (result?.type === 'icg:heartbeat') {
        expect(typeof result.at).toBe('number');
      }
    });

    it('builds heartbeat when payload is null', () => {
      expect(normalizeInbound('icg:heartbeat', null)?.type).toBe('icg:heartbeat');
    });
  });

  describe('unknown events', () => {
    it('returns null for unmapped event names', () => {
      expect(normalizeInbound('random-event', {})).toBeNull();
      expect(normalizeInbound('', null)).toBeNull();
      expect(normalizeInbound('icg:reconnect', {})).toBeNull();
    });
  });
});

describe('SocketGateway.broadcastToMatch', () => {
  it('only accepts messages that do not carry per-seat match content', () => {
    const registry = { getSocketsByMatch: () => [] } as unknown as ConnectionRegistry;
    const gateway = new SocketGateway({
      registry,
      router: {} as never,
      bot: {} as never,
      heartbeat: {} as never,
      moveGateway: {} as never,
      bans: {} as never,
    });

    gateway.broadcastToMatch('m1', { type: 'icg:aiTakeover', matchID: 'm1', playerID: '1' });
    gateway.broadcastToMatch('m1', { type: 'icg:seats', matchID: 'm1', seats: [] });

    // @ts-expect-error icg:state 带每个座位不同的视图，不能广播
    gateway.broadcastToMatch('m1', { type: 'icg:state' });
    // @ts-expect-error icg:step 带每个座位不同的视图与事件，不能广播
    gateway.broadcastToMatch('m1', { type: 'icg:step' });
    // @ts-expect-error icg:moveResult 只回给提交者，不能广播
    gateway.broadcastToMatch('m1', { type: 'icg:moveResult' });
  });
});

describe('SocketGateway.disconnectPlayer', () => {
  it('tells every connection of the account it is banned and disconnects it', () => {
    const emitted: Array<{ sid: string; event: string; payload: unknown }> = [];
    const disconnected: string[] = [];
    const registry = {
      getSocketsByPlayer: (id: string) => (id === 'acct-1' ? ['s1', 's2'] : []),
    } as unknown as ConnectionRegistry;
    const gateway = new SocketGateway({
      registry,
      router: {} as never,
      bot: {} as never,
      heartbeat: {} as never,
      moveGateway: {} as never,
      bans: {} as never,
    });
    const fakeIo = {
      to: (sid: string) => ({
        emit: (event: string, payload: unknown) => emitted.push({ sid, event, payload }),
      }),
      sockets: {
        sockets: new Map(
          ['s1', 's2', 's3'].map((sid) => [sid, { disconnect: () => disconnected.push(sid) }]),
        ),
      },
    };
    (gateway as unknown as { io: unknown }).io = fakeIo;

    expect(gateway.disconnectPlayer('acct-1')).toBe(2);
    expect(disconnected).toEqual(['s1', 's2']);
    expect(emitted.map((e) => [e.sid, e.event])).toEqual([
      ['s1', 'icg:error'],
      ['s2', 'icg:error'],
    ]);
    expect(emitted[0]!.payload).toMatchObject({ code: 'BANNED' });
    expect(gateway.disconnectPlayer('nobody')).toBe(0);
  });
});

describe('SocketGateway 存储与中断通知', () => {
  type Emitted = { sid: string; event: string; payload: unknown };

  function setup(opts: { room?: MatchRoom } = {}) {
    const emitted: Emitted[] = [];
    const disconnected: string[] = [];
    const conns: Record<string, Array<{ socketId: string; seat: string }>> = {
      m1: [
        { socketId: 's1', seat: '0' },
        { socketId: 's2', seat: '1' },
      ],
      m2: [{ socketId: 's3', seat: '0' }],
    };
    const registry = {
      getSocketsByMatch: (m: string) => (conns[m] ?? []).map((c) => c.socketId),
      listMatchConnections: (m: string) => conns[m] ?? [],
    } as unknown as ConnectionRegistry;
    const gateway = new SocketGateway({
      registry,
      router: {} as never,
      bot: { isBotControlled: () => false } as never,
      heartbeat: {} as never,
      moveGateway: {} as never,
      bans: {} as never,
    });
    (gateway as unknown as { io: unknown }).io = {
      to: (sid: string) => ({
        emit: (event: string, payload: unknown) => emitted.push({ sid, event, payload }),
      }),
      sockets: {
        sockets: new Map(
          ['s1', 's2', 's3'].map((sid) => [sid, { disconnect: () => disconnected.push(sid) }]),
        ),
      },
    };
    if (opts.room) gateway.bindMatches({ get: () => opts.room } as unknown as MatchService);
    return { gateway, emitted, disconnected };
  }

  it('存储不可用 / 恢复只发给这一局的连接，且只带公开信息', () => {
    const { gateway, emitted } = setup();
    gateway.sendStorageHealth('m1', false);
    gateway.sendStorageHealth('m1', true);
    expect(emitted.map((e) => [e.sid, e.event, e.payload])).toEqual([
      ['s1', 'icg:storage', { type: 'icg:storage', matchID: 'm1', healthy: false }],
      ['s2', 'icg:storage', { type: 'icg:storage', matchID: 'm1', healthy: false }],
      ['s1', 'icg:storage', { type: 'icg:storage', matchID: 'm1', healthy: true }],
      ['s2', 'icg:storage', { type: 'icg:storage', matchID: 'm1', healthy: true }],
    ]);
  });

  it('对局中断：通知并断开这一局的连接，其他局不受影响', () => {
    const { gateway, emitted, disconnected } = setup();
    gateway.abortMatch('m1');
    expect(emitted.map((e) => [e.sid, e.event])).toEqual([
      ['s1', 'icg:error'],
      ['s2', 'icg:error'],
    ]);
    expect(emitted[0]!.payload).toMatchObject({ code: 'MATCH_ABORTED' });
    expect(disconnected).toEqual(['s1', 's2']);
  });

  function makeRoom(): MatchRoom {
    const state = createMatch(InceptionCityGame, {
      numPlayers: 4,
      setupData: { rngSeed: 'g' },
      seed: 'g',
    });
    const seats = ['0', '1', '2', '3'].map((seat) => ({
      seat,
      playerId: `a${seat}`,
      nickname: `P${seat}`,
      isBot: false,
    }));
    return new MatchRoom('m1', seats, state, {
      game: InceptionCityGame,
      persist: async () => 'ok',
      onStep: () => undefined,
      onGameOver: () => undefined,
      isTakenOver: () => false,
      timing: { botStepDelayMs: 1, pendingTimeoutMs: 1, turnTimeoutMs: 1 },
      timers: { setTimeout: () => 0, clearTimeout: () => undefined, now: () => 0 },
    });
  }

  it('重发完整视图：每条连接按自己的座位收到 icg:state，其他局不收', () => {
    const { gateway, emitted } = setup({ room: makeRoom() });
    gateway.resyncMatch('m1');
    const states = emitted.filter((e) => e.event === 'icg:state');
    expect(states.map((e) => e.sid)).toEqual(['s1', 's2']);
    expect(states.map((e) => (e.payload as { seat: string }).seat)).toEqual(['0', '1']);
    // 重新加载后的版本号可能比客户端手里的低，带上 reset 让客户端无条件接受
    expect(states.every((e) => (e.payload as { reset?: boolean }).reset === true)).toBe(true);
    expect(emitted.every((e) => e.sid !== 's3')).toBe(true);
  });

  it('重发视图之后按新房间的存储状态再发一条 icg:storage：正常时让旧的提示消失', () => {
    const { gateway, emitted } = setup({ room: makeRoom() });
    gateway.resyncMatch('m1');
    expect(emitted.map((e) => [e.sid, e.event])).toEqual([
      ['s1', 'icg:state'],
      ['s2', 'icg:state'],
      ['s1', 'icg:storage'],
      ['s2', 'icg:storage'],
    ]);
    expect(emitted.slice(2).map((e) => e.payload)).toEqual([
      { type: 'icg:storage', matchID: 'm1', healthy: true },
      { type: 'icg:storage', matchID: 'm1', healthy: true },
    ]);
  });

  it('新房间的存储仍不可用时，icg:storage 带 healthy: false', () => {
    const room = makeRoom();
    vi.spyOn(room, 'isStorageHealthy').mockReturnValue(false);
    const { gateway, emitted } = setup({ room });
    gateway.resyncMatch('m1');
    const storage = emitted.filter((e) => e.event === 'icg:storage');
    expect(storage.map((e) => e.payload)).toEqual([
      { type: 'icg:storage', matchID: 'm1', healthy: false },
      { type: 'icg:storage', matchID: 'm1', healthy: false },
    ]);
  });
});
