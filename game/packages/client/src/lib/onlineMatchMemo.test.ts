import { describe, expect, it } from 'vitest';
import { forgetOnlineMatch, readOnlineMatch, rememberOnlineMatch } from './onlineMatchMemo';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const brokenStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
} as unknown as Storage;

describe('onlineMatchMemo', () => {
  it('记下后能读回，忘掉后读到 null', () => {
    const s = fakeStorage();
    expect(readOnlineMatch(s)).toBeNull();
    rememberOnlineMatch({ matchID: 'm1', code: 'ABC234' }, s);
    expect(readOnlineMatch(s)).toEqual({ matchID: 'm1', code: 'ABC234' });
    forgetOnlineMatch(s);
    expect(readOnlineMatch(s)).toBeNull();
  });

  it('内容损坏或字段缺失时读到 null', () => {
    const s = fakeStorage();
    s.setItem('icgame-online-match', '{oops');
    expect(readOnlineMatch(s)).toBeNull();
    s.setItem('icgame-online-match', JSON.stringify({ matchID: 1 }));
    expect(readOnlineMatch(s)).toBeNull();
  });

  it('存储不可用时不抛错', () => {
    expect(() => rememberOnlineMatch({ matchID: 'm', code: null }, brokenStorage)).not.toThrow();
    expect(readOnlineMatch(brokenStorage)).toBeNull();
    expect(() => forgetOnlineMatch(brokenStorage)).not.toThrow();
  });

  it('没有房间码时也能记录', () => {
    const s = fakeStorage();
    rememberOnlineMatch({ matchID: 'm2', code: null }, s);
    expect(readOnlineMatch(s)).toEqual({ matchID: 'm2', code: null });
  });
});
