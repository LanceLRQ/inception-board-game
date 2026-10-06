// IndexedDB 的薄封装：Promise 化的键值存储，带版本号与升级回调；IndexedDB 不可用时返回 null，调用方据此降级为不存档
//
// 主线程与 Worker 里都能用（两处各自打开自己的连接）。不依赖任何第三方库。

import { logger } from './logger';

/** 键值存储：存取任意可结构化克隆的值 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  /** 同一个事务里写入多项：要么都写入，要么都不写 */
  setMany(entries: ReadonlyArray<readonly [string, unknown]>): Promise<void>;
  delete(...keys: string[]): Promise<void>;
  close(): void;
}

export interface OpenKeyValueStoreOptions {
  /** 数据库名 */
  name: string;
  /** 数据库版本：结构变了就加 1，并在 onUpgrade 里迁移 */
  version: number;
  /** 对象仓库名，不存在时在升级里创建 */
  storeName: string;
  /** 升级回调：oldVersion 为 0 表示全新创建；仓库已由本封装创建，这里只做数据迁移或清理 */
  onUpgrade?: (db: IDBDatabase, oldVersion: number, newVersion: number, tx: IDBTransaction) => void;
  /** 注入 IndexedDB 工厂（测试用）；默认取全局 indexedDB */
  factory?: IDBFactory | null;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function wrap(db: IDBDatabase, storeName: string): KeyValueStore {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const tx = db.transaction(storeName, 'readonly');
      return (await requestToPromise(tx.objectStore(storeName).get(key))) as T | undefined;
    },
    async set(key, value) {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      await transactionDone(tx);
    },
    async setMany(entries) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const [key, value] of entries) store.put(value, key);
      await transactionDone(tx);
    },
    async delete(...keys) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const key of keys) store.delete(key);
      await transactionDone(tx);
    },
    close() {
      db.close();
    },
  };
}

/**
 * 打开键值存储。IndexedDB 不存在（隐私模式、旧环境）、被阻塞或打开失败时返回 null，不抛错。
 */
export function openKeyValueStore(opts: OpenKeyValueStoreOptions): Promise<KeyValueStore | null> {
  const factory =
    opts.factory !== undefined ? opts.factory : typeof indexedDB !== 'undefined' ? indexedDB : null;
  if (factory === null) {
    logger.warn('storage', 'IndexedDB unavailable, running without persistence');
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(opts.name, opts.version);
    } catch (err) {
      logger.warn('storage', 'IndexedDB open threw', err);
      resolve(null);
      return;
    }
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(opts.storeName)) db.createObjectStore(opts.storeName);
      const tx = request.transaction;
      if (opts.onUpgrade && tx) {
        opts.onUpgrade(db, event.oldVersion, event.newVersion ?? opts.version, tx);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // 别的标签页要升级版本时让路，否则对方会一直被阻塞
      db.onversionchange = () => db.close();
      resolve(wrap(db, opts.storeName));
    };
    request.onerror = () => {
      logger.warn('storage', 'IndexedDB open failed', request.error);
      resolve(null);
    };
    request.onblocked = () => {
      logger.warn('storage', 'IndexedDB open blocked by another connection');
    };
  });
}

/** 内存实现：测试替身，也可作为「本次会话内有效」的存档后端 */
export function createMemoryStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const data = new Map<string, unknown>(Object.entries(initial));
  const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return clone(data.get(key)) as T | undefined;
    },
    async set(key, value) {
      data.set(key, clone(value));
    },
    async setMany(entries) {
      for (const [key, value] of entries) data.set(key, clone(value));
    },
    async delete(...keys) {
      for (const key of keys) data.delete(key);
    },
    close() {},
  };
}
