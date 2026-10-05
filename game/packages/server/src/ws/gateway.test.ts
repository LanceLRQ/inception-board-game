import { describe, it, expect } from 'vitest';
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
