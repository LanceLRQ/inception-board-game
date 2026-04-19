// WSClient 单元测试（mock socket.io-client）

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WSClient, type SocketLike, type SocketFactory } from './wsClient';

interface FakeSocket extends SocketLike {
  handlers: Map<string, Set<(...args: unknown[]) => void>>;
  ioHandlers: Map<string, Set<(...args: unknown[]) => void>>;
  emitted: Array<{ event: string; args: unknown[] }>;
  trigger(event: string, ...args: unknown[]): void;
  triggerIo(event: string, ...args: unknown[]): void;
}

function createFakeSocket(): FakeSocket {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const ioHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitted: Array<{ event: string; args: unknown[] }> = [];

  const socket: FakeSocket = {
    connected: false,
    id: 'fake-socket',
    handlers,
    ioHandlers,
    emitted,
    connect() {
      this.connected = true;
    },
    disconnect() {
      this.connected = false;
      this.trigger('disconnect', 'io client disconnect');
    },
    emit(event: string, ...args: unknown[]) {
      emitted.push({ event, args });
    },
    on(event, listener) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(listener);
    },
    off(event, listener) {
      if (!listener) {
        handlers.delete(event);
        return;
      }
      handlers.get(event)?.delete(listener);
    },
    io: {
      on(event: string, listener: (...args: unknown[]) => void) {
        if (!ioHandlers.has(event)) ioHandlers.set(event, new Set());
        ioHandlers.get(event)!.add(listener);
      },
    },
    trigger(event, ...args) {
      handlers.get(event)?.forEach((l) => l(...args));
    },
    triggerIo(event, ...args) {
      ioHandlers.get(event)?.forEach((l) => l(...args));
    },
  };
  return socket;
}

describe('WSClient', () => {
  let fake: FakeSocket;
  let factory: SocketFactory;
  let intervalCb: (() => void) | null = null;
  const fakeSetInterval = vi.fn((cb: () => void) => {
    intervalCb = cb;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const fakeClearInterval = vi.fn(() => {
    intervalCb = null;
  }) as unknown as typeof clearInterval;

  beforeEach(() => {
    fake = createFakeSocket();
    factory = vi.fn(() => fake) as SocketFactory;
    intervalCb = null;
  });

  const makeClient = () =>
    new WSClient(
      { url: 'http://localhost:3001', token: 't', matchID: 'm1', heartbeatIntervalMs: 1000 },
      factory,
      { setInterval: fakeSetInterval, clearInterval: fakeClearInterval },
    );

  describe('connect lifecycle', () => {
    it('starts in idle state', () => {
      const client = makeClient();
      expect(client.getState()).toBe('idle');
    });

    it('transitions to connecting then connected', () => {
      const client = makeClient();
      const states: string[] = [];
      client.onStateChange((s) => states.push(s));

      client.connect();
      expect(states).toContain('connecting');

      fake.connected = true;
      fake.trigger('connect');
      expect(client.getState()).toBe('connected');
    });

    it('passes auth token and matchID to factory', () => {
      const client = makeClient();
      client.connect();
      expect(factory).toHaveBeenCalledWith(
        'http://localhost:3001',
        expect.objectContaining({ auth: { token: 't', matchID: 'm1' } }),
      );
    });

    it('ignores duplicate connect()', () => {
      const client = makeClient();
      client.connect();
      client.connect();
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect handling', () => {
    it('io client disconnect → disconnected state', () => {
      const client = makeClient();
      client.connect();
      fake.connected = true;
      fake.trigger('connect');
      fake.trigger('disconnect', 'io client disconnect');
      expect(client.getState()).toBe('disconnected');
    });

    it('transport close → reconnecting state', () => {
      const client = makeClient();
      client.connect();
      fake.connected = true;
      fake.trigger('connect');
      fake.trigger('disconnect', 'transport close');
      expect(client.getState()).toBe('reconnecting');
    });

    it('connect_error → reconnecting state', () => {
      const client = makeClient();
      client.connect();
      fake.trigger('connect_error', new Error('boom'));
      expect(client.getState()).toBe('reconnecting');
    });

    it('reconnect_failed → failed state', () => {
      const client = makeClient();
      client.connect();
      fake.triggerIo('reconnect_failed');
      expect(client.getState()).toBe('failed');
    });
  });

  describe('heartbeat', () => {
    it('starts heartbeat on connect', () => {
      const client = makeClient();
      client.connect();
      fake.connected = true;
      fake.trigger('connect');

      expect(fakeSetInterval).toHaveBeenCalled();
      intervalCb?.();
      const hb = fake.emitted.find((e) => e.event === 'icg:heartbeat');
      expect(hb).toBeDefined();
    });

    it('stops heartbeat on disconnect', () => {
      const client = makeClient();
      client.connect();
      fake.connected = true;
      fake.trigger('connect');
      fake.trigger('disconnect', 'io client disconnect');
      expect(fakeClearInterval).toHaveBeenCalled();
    });

    it('pulseHeartbeat no-ops when disconnected', () => {
      const client = makeClient();
      client.connect();
      // not connected yet
      client.pulseHeartbeat();
      expect(fake.emitted.find((e) => e.event === 'icg:heartbeat')).toBeUndefined();
    });
  });

  describe('message dispatch', () => {
    it('icg:patch updates lastEventSeq', () => {
      const client = makeClient();
      client.connect();
      fake.trigger('icg:patch', { eventSeq: 42 });
      expect(client.getLastEventSeq()).toBe(42);
    });

    it('lastEventSeq only increases', () => {
      const client = makeClient();
      client.connect();
      fake.trigger('icg:patch', { eventSeq: 42 });
      fake.trigger('icg:patch', { eventSeq: 10 });
      expect(client.getLastEventSeq()).toBe(42);
    });

    it('onMessage subscribers receive payload', () => {
      const client = makeClient();
      client.connect();
      const listener = vi.fn();
      client.onMessage('icg:event', listener);
      fake.trigger('icg:event', { foo: 1 });
      expect(listener).toHaveBeenCalledWith({ foo: 1 });
    });

    it('unsubscribe stops further callbacks', () => {
      const client = makeClient();
      client.connect();
      const listener = vi.fn();
      const unsub = client.onMessage('icg:event', listener);
      unsub();
      fake.trigger('icg:event', { foo: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('listener errors are swallowed', () => {
      const client = makeClient();
      client.connect();
      client.onMessage('icg:event', () => {
        throw new Error('oops');
      });
      expect(() => fake.trigger('icg:event', {})).not.toThrow();
    });
  });

  describe('send', () => {
    it('forwards emit when connected', () => {
      const client = makeClient();
      client.connect();
      fake.connected = true;
      fake.trigger('connect');
      client.send('icg:ackIntent', { intentID: 'x' });
      expect(fake.emitted.at(-1)).toEqual({
        event: 'icg:ackIntent',
        args: [{ intentID: 'x' }],
      });
    });

    it('drops emit when not connected', () => {
      const client = makeClient();
      client.connect();
      fake.connected = false;
      client.send('icg:ackIntent', { intentID: 'x' });
      expect(fake.emitted.find((e) => e.event === 'icg:ackIntent')).toBeUndefined();
    });
  });

  describe('requestReconnectSync', () => {
    it('sends icg:reconnect with lastEventSeq', () => {
      const client = makeClient();
      client.connect();
      fake.connected = true;
      fake.trigger('connect');
      fake.trigger('icg:patch', { eventSeq: 7 });
      client.requestReconnectSync();
      const msg = fake.emitted.find((e) => e.event === 'icg:reconnect');
      expect(msg?.args[0]).toMatchObject({ lastEventSeq: 7 });
    });
  });

  describe('state change listener', () => {
    it('unsubscribe stops callbacks', () => {
      const client = makeClient();
      const listener = vi.fn();
      const unsub = client.onStateChange(listener);
      unsub();
      client.connect();
      expect(listener).not.toHaveBeenCalled();
    });

    it('deduplicates same state', () => {
      const client = makeClient();
      const listener = vi.fn();
      client.onStateChange(listener);
      client.connect();
      fake.connected = true;
      fake.trigger('connect');
      fake.trigger('connect'); // duplicate
      expect(listener.mock.calls.filter((c) => c[0] === 'connected')).toHaveLength(1);
    });
  });
});
