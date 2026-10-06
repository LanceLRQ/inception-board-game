import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  logger: { flow: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createMemoryStore, type KeyValueStore } from './idbStore';
import {
  NO_LOCAL_SAVES,
  SAVE_FORMAT_VERSION,
  createLocalMatchSaves,
  type LocalMatchSaves,
} from './localMatchSave';
import { logger } from './logger';

const ENGINE = 9;
const input = { playerCount: 5, turn: 7, stateID: 42, state: { G: { deep: [1, 2, 3] } } };

describe('createLocalMatchSaves', () => {
  let store: KeyValueStore;
  let saves: LocalMatchSaves;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createMemoryStore();
    saves = createLocalMatchSaves(store, { engineSchema: ENGINE, now: () => 1_700_000_000_000 });
  });

  it('没有存档时读摘要与读完整存档都是 null', async () => {
    expect(await saves.readMeta()).toBeNull();
    expect(await saves.load()).toBeNull();
  });

  it('写入后读回摘要与完整存档，摘要里没有引擎状态', async () => {
    await saves.save(input);
    const meta = await saves.readMeta();
    expect(meta).toEqual({
      format: SAVE_FORMAT_VERSION,
      engineSchema: ENGINE,
      playerCount: 5,
      turn: 7,
      stateID: 42,
      savedAt: 1_700_000_000_000,
    });
    expect(JSON.stringify(meta)).not.toContain('deep');
    const record = await saves.load();
    expect(record?.state).toEqual(input.state);
    expect(record?.playerCount).toBe(5);
  });

  it('再次写入覆盖旧存档', async () => {
    await saves.save(input);
    await saves.save({ ...input, turn: 8, stateID: 43, state: { G: 'new' } });
    expect((await saves.readMeta())?.turn).toBe(8);
    expect((await saves.load())?.state).toEqual({ G: 'new' });
  });

  it('清除后读不到', async () => {
    await saves.save(input);
    await saves.clear();
    expect(await saves.readMeta()).toBeNull();
    expect(await store.get('local-match:state')).toBeUndefined();
  });

  it('引擎状态版本对不上：丢弃存档并记警告', async () => {
    await saves.save(input);
    const newer = createLocalMatchSaves(store, { engineSchema: ENGINE + 1 });
    expect(await newer.readMeta()).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
    // 存档已被清掉，换回旧版本也读不到了
    expect(await saves.readMeta()).toBeNull();
  });

  it('存档格式版本对不上：丢弃', async () => {
    await store.set('local-match:meta', {
      format: SAVE_FORMAT_VERSION + 1,
      engineSchema: ENGINE,
      playerCount: 4,
      turn: 1,
      stateID: 1,
      savedAt: 1,
    });
    expect(await saves.readMeta()).toBeNull();
  });

  it('摘要形状不对：丢弃', async () => {
    await store.set('local-match:meta', { hello: 'world' });
    expect(await saves.readMeta()).toBeNull();
    await store.set('local-match:meta', 'junk');
    expect(await saves.readMeta()).toBeNull();
  });

  it('状态缺失或与摘要不是同一次写入：丢弃', async () => {
    await saves.save(input);
    await store.delete('local-match:state');
    expect(await saves.load()).toBeNull();

    await saves.save(input);
    await store.set('local-match:state', { stateID: 1, state: {} });
    expect(await saves.load()).toBeNull();
    expect(await saves.readMeta()).toBeNull();
  });

  it('存储读取出错：读取返回 null 并清掉存档，不抛错', async () => {
    const broken: KeyValueStore = {
      ...createMemoryStore(),
      get: vi.fn().mockRejectedValue(new Error('read failed')),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const s = createLocalMatchSaves(broken, { engineSchema: ENGINE });
    await expect(s.readMeta()).resolves.toBeNull();
    await expect(s.load()).resolves.toBeNull();
    expect(broken.delete).toHaveBeenCalled();
  });

  it('存储写入与清除出错：只记日志，不抛错', async () => {
    const broken: KeyValueStore = {
      ...createMemoryStore(),
      setMany: vi.fn().mockRejectedValue(new Error('quota')),
      delete: vi.fn().mockRejectedValue(new Error('nope')),
    };
    const s = createLocalMatchSaves(broken, { engineSchema: ENGINE });
    await expect(s.save(input)).resolves.toBeUndefined();
    await expect(s.clear()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('没有存储（IndexedDB 不可用）时降级为不存档', async () => {
    const none = createLocalMatchSaves(null, { engineSchema: ENGINE });
    expect(none).toBe(NO_LOCAL_SAVES);
    await none.save(input);
    expect(await none.readMeta()).toBeNull();
    expect(await none.load()).toBeNull();
    await expect(none.clear()).resolves.toBeUndefined();
  });
});
