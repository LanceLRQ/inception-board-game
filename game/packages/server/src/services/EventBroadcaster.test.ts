import { describe, it, expect, vi } from 'vitest';
import type { BroadcastEvent, BroadcastContext } from '@icgame/game-engine';
import {
  EventBroadcaster,
  InMemorySocketRegistry,
  type SocketEmitter,
} from './EventBroadcaster.js';
import {
  MatchEventService,
  InMemoryMatchEventStore,
  broadcastEventToAppendInput,
} from './MatchEventService.js';

function makeEmitter(): {
  emitter: SocketEmitter;
  calls: Array<{ sid: string; event: string; data: unknown }>;
} {
  const calls: Array<{ sid: string; event: string; data: unknown }> = [];
  const emitter: SocketEmitter = {
    to(sid: string) {
      return {
        emit(event: string, data: unknown) {
          calls.push({ sid, event, data });
        },
      };
    },
  };
  return { emitter, calls };
}

function makeEvent(overrides: Partial<BroadcastEvent> = {}): BroadcastEvent {
  return {
    eventKind: 'card_played',
    matchId: 'm1',
    seq: 1,
    timestamp: 1000,
    visibility: 'public',
    payload: { card: 'SHOOT-1' },
    ...overrides,
  };
}

const CTX: BroadcastContext = {
  dreamMasterID: 'pM',
  allPlayerIDs: ['p1', 'p2', 'pM'],
};

describe('EventBroadcaster · persist hook', () => {
  it('invokes onPersist once per publish', () => {
    const { emitter } = makeEmitter();
    const persist = vi.fn();
    const reg = new InMemorySocketRegistry();
    reg.register('m1', 'p1', 's1');
    const b = new EventBroadcaster(emitter, reg, { onPersist: persist });

    b.publish(makeEvent(), CTX);
    expect(persist).toHaveBeenCalledTimes(1);
    const arg = persist.mock.calls[0]?.[0] as BroadcastEvent;
    expect(arg.eventKind).toBe('card_played');
    expect(arg.seq).toBe(1);
  });

  it('does not throw when persist callback throws synchronously', () => {
    const { emitter } = makeEmitter();
    const persist = vi.fn(() => {
      throw new Error('boom');
    });
    const reg = new InMemorySocketRegistry();
    reg.register('m1', 'p1', 's1');
    const b = new EventBroadcaster(emitter, reg, { onPersist: persist });

    expect(() => b.publish(makeEvent(), CTX)).not.toThrow();
    expect(persist).toHaveBeenCalled();
  });

  it('does not throw when persist callback rejects asynchronously', async () => {
    const { emitter, calls } = makeEmitter();
    const persist = vi.fn(async () => {
      throw new Error('async boom');
    });
    const reg = new InMemorySocketRegistry();
    reg.register('m1', 'p1', 's1');
    const b = new EventBroadcaster(emitter, reg, { onPersist: persist });

    expect(() => b.publish(makeEvent(), CTX)).not.toThrow();
    // 广播照常发出
    expect(calls.length).toBe(1);
    // 等微任务队列排空，确认 unhandled rejection 被 catch 掉
    await new Promise((r) => setImmediate(r));
  });

  it('persists even when there are no online recipients', () => {
    const { emitter } = makeEmitter();
    const persist = vi.fn();
    const reg = new InMemorySocketRegistry(); // 无注册 socket
    const b = new EventBroadcaster(emitter, reg, { onPersist: persist });

    b.publish(makeEvent(), CTX);
    // 没有 socket 也应归档
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('works without onPersist (backward compatible)', () => {
    const { emitter, calls } = makeEmitter();
    const reg = new InMemorySocketRegistry();
    reg.register('m1', 'p1', 's1');
    const b = new EventBroadcaster(emitter, reg);

    expect(() => b.publish(makeEvent(), CTX)).not.toThrow();
    expect(calls.length).toBe(1);
  });
});

describe('EventBroadcaster · pipeline 集成（broadcaster → match_events）', () => {
  it('archives each published event via MatchEventService', async () => {
    const { emitter } = makeEmitter();
    const reg = new InMemorySocketRegistry();
    reg.register('m1', 'p1', 's1');
    reg.register('m1', 'pM', 'sM');

    const svc = new MatchEventService(new InMemoryMatchEventStore());
    const b = new EventBroadcaster(emitter, reg, {
      onPersist: async (event) => {
        await svc.append(broadcastEventToAppendInput(event));
      },
    });

    b.publish(makeEvent({ seq: 0, eventKind: 'round_start', payload: { round: 1 } }), CTX);
    b.publish(makeEvent({ seq: 1, eventKind: 'card_played', payload: { card: 'KICK' } }), CTX);
    b.publish(makeEvent({ seq: 2, eventKind: 'turn_end', payload: {} }), CTX);

    // 等待异步 append 完成
    await new Promise((r) => setImmediate(r));

    const archive = await svc.list('m1');
    expect(archive.length).toBe(3);
    expect(archive.map((e) => e.moveCounter)).toEqual([0, 1, 2]);
    expect(archive.map((e) => e.eventKind)).toEqual(['round_start', 'card_played', 'turn_end']);
    expect(archive[1]?.payload).toEqual({ card: 'KICK' });
  });

  it('duplicate seq archives exactly once (idempotent)', async () => {
    const { emitter } = makeEmitter();
    const reg = new InMemorySocketRegistry();
    reg.register('m1', 'p1', 's1');

    const svc = new MatchEventService(new InMemoryMatchEventStore());
    const b = new EventBroadcaster(emitter, reg, {
      onPersist: async (event) => {
        await svc.append(broadcastEventToAppendInput(event));
      },
    });

    const e = makeEvent({ seq: 5, eventKind: 'same_kind' });
    b.publish(e, CTX);
    b.publish(e, CTX); // 重放
    await new Promise((r) => setImmediate(r));

    expect(await svc.count('m1')).toBe(1);
  });

  it('still delivers to sockets even if persistence silently fails', async () => {
    const { emitter, calls } = makeEmitter();
    const reg = new InMemorySocketRegistry();
    reg.register('m1', 'p1', 's1');

    const persist = vi.fn().mockRejectedValue(new Error('db down'));
    const b = new EventBroadcaster(emitter, reg, { onPersist: persist });

    b.publish(makeEvent(), CTX);
    await new Promise((r) => setImmediate(r));

    expect(calls.length).toBe(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('EventBroadcaster · recipient filtering (sanity)', () => {
  it('broadcasts public events to all registered sockets', () => {
    const { emitter, calls } = makeEmitter();
    const reg = new InMemorySocketRegistry();
    reg.register('m1', 'p1', 's1');
    reg.register('m1', 'p2', 's2');
    reg.register('m1', 'pM', 'sM');
    const b = new EventBroadcaster(emitter, reg);

    b.publish(makeEvent({ visibility: 'public' }), CTX);
    const sids = calls.map((c) => c.sid).sort();
    expect(sids).toEqual(['s1', 's2', 'sM']);
  });

  it('master-only event only goes to dream master', () => {
    const { emitter, calls } = makeEmitter();
    const reg = new InMemorySocketRegistry();
    reg.register('m1', 'p1', 's1');
    reg.register('m1', 'pM', 'sM');
    const b = new EventBroadcaster(emitter, reg);

    b.publish(makeEvent({ visibility: 'master-only' }), CTX);
    expect(calls.map((c) => c.sid)).toEqual(['sM']);
  });
});
