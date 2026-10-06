// IndexedDB 封装：用一个最小的假实现驱动（不引入第三方依赖）

import { describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  logger: { flow: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createMemoryStore, openKeyValueStore } from './idbStore';

type AnyHandler = ((event?: unknown) => void) | null;

/** 极简的 IDBFactory：只实现封装用到的那一部分 */
class FakeFactory {
  readonly dbs = new Map<string, { version: number; stores: Map<string, Map<string, unknown>> }>();
  failOpen: 'throw' | 'error' | 'blocked' | null = null;
  failWrites = false;
  upgrades: Array<{ oldVersion: number; newVersion: number }> = [];

  open(name: string, version: number): IDBOpenDBRequest {
    if (this.failOpen === 'throw') throw new Error('open threw');
    const req = {
      result: undefined as unknown,
      error: null as Error | null,
      transaction: {} as unknown,
      onupgradeneeded: null as AnyHandler,
      onsuccess: null as AnyHandler,
      onerror: null as AnyHandler,
      onblocked: null as AnyHandler,
    };
    queueMicrotask(() => {
      if (this.failOpen === 'error') {
        req.error = new Error('open failed');
        req.onerror?.();
        return;
      }
      if (this.failOpen === 'blocked') {
        req.onblocked?.();
        return;
      }
      let record = this.dbs.get(name);
      const oldVersion = record?.version ?? 0;
      record ??= { version: 0, stores: new Map() };
      this.dbs.set(name, record);
      const rec = record;
      const db = {
        objectStoreNames: { contains: (n: string) => rec.stores.has(n) },
        createObjectStore: (n: string) => {
          rec.stores.set(n, new Map());
        },
        transaction: (storeName: string) => this.makeTx(rec.stores.get(storeName)!),
        close: () => {},
        onversionchange: null as AnyHandler,
      };
      req.result = db;
      if (version > oldVersion) {
        this.upgrades.push({ oldVersion, newVersion: version });
        rec.version = version;
        req.onupgradeneeded?.({ oldVersion, newVersion: version });
      }
      req.onsuccess?.();
    });
    return req as unknown as IDBOpenDBRequest;
  }

  private makeTx(store: Map<string, unknown>) {
    const tx = {
      error: null as Error | null,
      oncomplete: null as AnyHandler,
      onerror: null as AnyHandler,
      onabort: null as AnyHandler,
      objectStore: () => ({
        get: (key: string) => {
          const r = {
            result: undefined as unknown,
            error: null,
            onsuccess: null as AnyHandler,
            onerror: null as AnyHandler,
          };
          queueMicrotask(() => {
            r.result = store.get(key);
            r.onsuccess?.();
          });
          return r;
        },
        put: (value: unknown, key: string) => {
          if (!this.failWrites) store.set(key, structuredClone(value));
        },
        delete: (key: string) => {
          if (!this.failWrites) store.delete(key);
        },
      }),
    };
    setTimeout(() => {
      if (this.failWrites) {
        tx.error = new Error('write failed');
        tx.onabort?.();
      } else {
        tx.oncomplete?.();
      }
    }, 0);
    return tx;
  }
}

const OPTS = { name: 'db', version: 1, storeName: 's' };

describe('openKeyValueStore', () => {
  it('没有 IndexedDB 时返回 null', async () => {
    await expect(openKeyValueStore({ ...OPTS, factory: null })).resolves.toBeNull();
  });

  it('读写删：写入的值可以读回，删除后读不到', async () => {
    const factory = new FakeFactory();
    const store = (await openKeyValueStore({
      ...OPTS,
      factory: factory as unknown as IDBFactory,
    }))!;
    expect(await store.get('a')).toBeUndefined();
    await store.set('a', { n: 1 });
    expect(await store.get('a')).toEqual({ n: 1 });
    await store.setMany([
      ['b', 2],
      ['c', 3],
    ]);
    expect(await store.get('b')).toBe(2);
    await store.delete('a', 'b');
    expect(await store.get('a')).toBeUndefined();
    expect(await store.get('b')).toBeUndefined();
    expect(await store.get('c')).toBe(3);
    store.close();
  });

  it('首次创建触发升级回调（旧版本为 0），同版本再次打开不触发', async () => {
    const factory = new FakeFactory();
    const onUpgrade = vi.fn();
    await openKeyValueStore({ ...OPTS, factory: factory as unknown as IDBFactory, onUpgrade });
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(onUpgrade.mock.calls[0]![1]).toBe(0);
    expect(onUpgrade.mock.calls[0]![2]).toBe(1);
    await openKeyValueStore({ ...OPTS, factory: factory as unknown as IDBFactory, onUpgrade });
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('版本提高时再次触发升级回调，带上旧版本号，已有数据保留', async () => {
    const factory = new FakeFactory();
    const first = (await openKeyValueStore({
      ...OPTS,
      factory: factory as unknown as IDBFactory,
    }))!;
    await first.set('k', 'v');
    const onUpgrade = vi.fn();
    const second = (await openKeyValueStore({
      ...OPTS,
      version: 2,
      factory: factory as unknown as IDBFactory,
      onUpgrade,
    }))!;
    expect(onUpgrade.mock.calls[0]!.slice(1, 3)).toEqual([1, 2]);
    expect(await second.get('k')).toBe('v');
  });

  it.each(['throw', 'error', 'blocked'] as const)(
    '打开失败（%s）时不抛错：error 与 throw 返回 null',
    async (mode) => {
      const factory = new FakeFactory();
      factory.failOpen = mode;
      if (mode === 'blocked') {
        // 被阻塞只记日志；这里不等它完成
        void openKeyValueStore({ ...OPTS, factory: factory as unknown as IDBFactory });
        return;
      }
      await expect(
        openKeyValueStore({ ...OPTS, factory: factory as unknown as IDBFactory }),
      ).resolves.toBeNull();
    },
  );

  it('写入失败时 Promise 拒绝（由上层存档层吞掉并记日志）', async () => {
    const factory = new FakeFactory();
    const store = (await openKeyValueStore({
      ...OPTS,
      factory: factory as unknown as IDBFactory,
    }))!;
    factory.failWrites = true;
    await expect(store.set('a', 1)).rejects.toThrow('write failed');
  });
});

describe('createMemoryStore', () => {
  it('读写删，值按结构化克隆隔离', async () => {
    const store = createMemoryStore({ seed: 1 });
    expect(await store.get('seed')).toBe(1);
    const original = { list: [1, 2] };
    await store.set('x', original);
    original.list.push(3);
    expect(await store.get('x')).toEqual({ list: [1, 2] });
    await store.setMany([['y', 'a']]);
    await store.delete('x', 'y');
    expect(await store.get('x')).toBeUndefined();
    expect(await store.get('y')).toBeUndefined();
    store.close();
  });
});
