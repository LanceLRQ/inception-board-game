import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MatchEventService,
  InMemoryMatchEventStore,
  sanitizeEventForStorage,
  isValidAppendInput,
} from './MatchEventService.js';

describe('sanitizeEventForStorage', () => {
  it('strips underscore-prefixed internal fields', () => {
    const out = sanitizeEventForStorage({ foo: 1, _internal: 'x', bar: null });
    expect(out).toEqual({ foo: 1, bar: null });
  });

  it('returns empty object for empty payload', () => {
    expect(sanitizeEventForStorage({})).toEqual({});
  });

  it('does not mutate the original payload', () => {
    const src = { keep: 1, _drop: 2 };
    sanitizeEventForStorage(src);
    expect(src).toEqual({ keep: 1, _drop: 2 });
  });

  it('preserves nested objects as-is (shallow strip only)', () => {
    const out = sanitizeEventForStorage({
      meta: { _nestedInternal: 'still here', seq: 3 },
    });
    expect(out).toEqual({ meta: { _nestedInternal: 'still here', seq: 3 } });
  });
});

describe('isValidAppendInput', () => {
  const base = {
    matchID: 'm1',
    moveCounter: 0,
    eventKind: 'round_start',
    payload: {},
  };

  it('accepts a minimal valid input', () => {
    expect(isValidAppendInput(base)).toBe(true);
  });

  it('rejects empty matchID', () => {
    expect(isValidAppendInput({ ...base, matchID: '' })).toBe(false);
  });

  it('rejects negative moveCounter', () => {
    expect(isValidAppendInput({ ...base, moveCounter: -1 })).toBe(false);
  });

  it('rejects non-integer moveCounter', () => {
    expect(isValidAppendInput({ ...base, moveCounter: 1.5 })).toBe(false);
  });

  it('rejects empty eventKind', () => {
    expect(isValidAppendInput({ ...base, eventKind: '' })).toBe(false);
  });

  it('rejects eventKind longer than 30 chars', () => {
    expect(isValidAppendInput({ ...base, eventKind: 'x'.repeat(31) })).toBe(false);
  });
});

describe('MatchEventService', () => {
  let store: InMemoryMatchEventStore;
  let svc: MatchEventService;

  beforeEach(() => {
    store = new InMemoryMatchEventStore();
    svc = new MatchEventService(store);
  });

  describe('append', () => {
    it('persists a valid event and returns ok', async () => {
      const r = await svc.append({
        matchID: 'm1',
        moveCounter: 0,
        eventKind: 'round_start',
        payload: { round: 1 },
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.record.matchID).toBe('m1');
        expect(r.record.moveCounter).toBe(0);
        expect(r.record.payload).toEqual({ round: 1 });
      }
    });

    it('sanitizes payload before storing', async () => {
      const r = await svc.append({
        matchID: 'm1',
        moveCounter: 1,
        eventKind: 'test',
        payload: { keep: 'yes', _drop: 'no' },
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.record.payload).toEqual({ keep: 'yes' });
    });

    it('rejects duplicate (matchID, moveCounter)', async () => {
      await svc.append({ matchID: 'm1', moveCounter: 0, eventKind: 'a', payload: {} });
      const dup = await svc.append({
        matchID: 'm1',
        moveCounter: 0,
        eventKind: 'b', // 不同内容也不能覆盖
        payload: {},
      });
      expect(dup.ok).toBe(false);
      if (!dup.ok) expect(dup.code).toBe('DUPLICATE');
    });

    it('rejects invalid input', async () => {
      const r = await svc.append({
        matchID: '',
        moveCounter: 0,
        eventKind: 'x',
        payload: {},
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_INPUT');
    });

    it('uses injected now() for createdAt', async () => {
      const fixed = new Date('2026-04-19T00:00:00Z');
      const svc2 = new MatchEventService(store, { now: () => fixed });
      const r = await svc2.append({
        matchID: 'mX',
        moveCounter: 0,
        eventKind: 'e',
        payload: {},
      });
      if (r.ok) expect(r.record.createdAt).toEqual(fixed);
    });

    it('prefers createdAt from input when given', async () => {
      const explicit = new Date('2025-01-01T00:00:00Z');
      const r = await svc.append({
        matchID: 'm2',
        moveCounter: 0,
        eventKind: 'e',
        payload: {},
        createdAt: explicit,
      });
      if (r.ok) expect(r.record.createdAt).toEqual(explicit);
    });

    it('invokes onAppended hook only on success', async () => {
      const hook = vi.fn();
      const svc2 = new MatchEventService(store, { onAppended: hook });
      await svc2.append({ matchID: 'm1', moveCounter: 0, eventKind: 'e', payload: {} });
      await svc2.append({ matchID: 'm1', moveCounter: 0, eventKind: 'e', payload: {} }); // DUP
      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('returns events sorted by moveCounter ascending', async () => {
      await svc.append({ matchID: 'm1', moveCounter: 3, eventKind: 'c', payload: {} });
      await svc.append({ matchID: 'm1', moveCounter: 1, eventKind: 'a', payload: {} });
      await svc.append({ matchID: 'm1', moveCounter: 2, eventKind: 'b', payload: {} });
      const list = await svc.list('m1');
      expect(list.map((e) => e.moveCounter)).toEqual([1, 2, 3]);
      expect(list.map((e) => e.eventKind)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for unknown match', async () => {
      expect(await svc.list('nope')).toEqual([]);
    });

    it('isolates matches (no cross-talk)', async () => {
      await svc.append({ matchID: 'm1', moveCounter: 0, eventKind: 'x', payload: {} });
      await svc.append({ matchID: 'm2', moveCounter: 0, eventKind: 'y', payload: {} });
      expect((await svc.list('m1')).length).toBe(1);
      expect((await svc.list('m2')).length).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all events for a match and returns count', async () => {
      await svc.append({ matchID: 'm1', moveCounter: 0, eventKind: 'a', payload: {} });
      await svc.append({ matchID: 'm1', moveCounter: 1, eventKind: 'b', payload: {} });
      const n = await svc.clear('m1');
      expect(n).toBe(2);
      expect(await svc.list('m1')).toEqual([]);
    });

    it('returns 0 for non-existent match', async () => {
      expect(await svc.clear('nope')).toBe(0);
    });

    it('allows re-append after clear (same moveCounter)', async () => {
      await svc.append({ matchID: 'm1', moveCounter: 0, eventKind: 'a', payload: {} });
      await svc.clear('m1');
      const r = await svc.append({
        matchID: 'm1',
        moveCounter: 0,
        eventKind: 'a2',
        payload: {},
      });
      expect(r.ok).toBe(true);
    });

    it('does not affect other matches', async () => {
      await svc.append({ matchID: 'm1', moveCounter: 0, eventKind: 'a', payload: {} });
      await svc.append({ matchID: 'm2', moveCounter: 0, eventKind: 'b', payload: {} });
      await svc.clear('m1');
      expect((await svc.list('m2')).length).toBe(1);
    });
  });

  describe('count', () => {
    it('reports current event count for a match', async () => {
      expect(await svc.count('m1')).toBe(0);
      await svc.append({ matchID: 'm1', moveCounter: 0, eventKind: 'a', payload: {} });
      await svc.append({ matchID: 'm1', moveCounter: 1, eventKind: 'b', payload: {} });
      expect(await svc.count('m1')).toBe(2);
    });
  });
});
