// localSave 测试 - mock idb-keyval

import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, val: unknown) => {
    store.set(key, val);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
  keys: vi.fn(() => Promise.resolve([...store.keys()])),
}));

import {
  saveLocalMatch,
  loadLocalMatch,
  deleteLocalMatch,
  listLocalSaves,
  type LocalSave,
} from './localSave.js';

const SAVE_PREFIX = 'icgame_save_';

function makeSave(id: string, ts: number): LocalSave {
  return { matchId: id, playerCount: 4, savedAt: ts, gameState: {} };
}

describe('localSave', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('saveLocalMatch', () => {
    it('saves with correct prefix key', async () => {
      const save = makeSave('match-1', 1000);
      await saveLocalMatch(save);
      expect(store.get(`${SAVE_PREFIX}match-1`)).toEqual(save);
    });
  });

  describe('loadLocalMatch', () => {
    it('loads existing match', async () => {
      const save = makeSave('match-1', 1000);
      store.set(`${SAVE_PREFIX}match-1`, save);
      const result = await loadLocalMatch('match-1');
      expect(result).toEqual(save);
    });

    it('returns undefined for non-existent match', async () => {
      expect(await loadLocalMatch('nope')).toBeUndefined();
    });
  });

  describe('deleteLocalMatch', () => {
    it('removes saved match', async () => {
      store.set(`${SAVE_PREFIX}match-1`, makeSave('match-1', 1000));
      await deleteLocalMatch('match-1');
      expect(store.has(`${SAVE_PREFIX}match-1`)).toBe(false);
    });
  });

  describe('listLocalSaves', () => {
    it('returns only saves with prefix, sorted by savedAt desc', async () => {
      store.set(`${SAVE_PREFIX}a`, makeSave('a', 100));
      store.set(`${SAVE_PREFIX}b`, makeSave('b', 300));
      store.set(`${SAVE_PREFIX}c`, makeSave('c', 200));
      store.set('other_key', { foo: 'bar' });

      const saves = await listLocalSaves();
      expect(saves).toHaveLength(3);
      expect(saves[0]!.matchId).toBe('b');
      expect(saves[1]!.matchId).toBe('c');
      expect(saves[2]!.matchId).toBe('a');
    });

    it('returns empty array when no saves', async () => {
      expect(await listLocalSaves()).toEqual([]);
    });

    it('ignores corrupted entries', async () => {
      store.set(`${SAVE_PREFIX}bad`, null);
      store.set(`${SAVE_PREFIX}good`, makeSave('good', 100));
      const saves = await listLocalSaves();
      expect(saves).toHaveLength(1);
      expect(saves[0]!.matchId).toBe('good');
    });
  });
});
