// 本地人机对局的存档：存取都经 KeyValueStore，可注入替身
//
// 存两项：
//   meta  人数、回合数、保存时间与版本号，不含任何对局状态；界面线程只读这一项来决定要不要提示「继续上一局」；
//   state 引擎的完整状态（含随机种子与牌库顺序），只在本机 Worker 里读写，不交给界面线程。
// 两项在同一个事务里写入。版本号对不上、形状不对或读取出错时一律丢弃存档，调用方开新局。

import { logger } from './logger';
import { openKeyValueStore, type KeyValueStore } from './idbStore';

export const SAVE_DB_NAME = 'icgame-local';
/** 数据库结构版本；存档的内容格式变化时用 SAVE_FORMAT_VERSION，不动这里 */
export const SAVE_DB_VERSION = 1;
export const SAVE_STORE_NAME = 'saves';
/** 存档内容格式的版本；改了 meta / state 的形状就加 1，旧存档会被丢弃 */
export const SAVE_FORMAT_VERSION = 1;

const META_KEY = 'local-match:meta';
const STATE_KEY = 'local-match:state';

/** 存档摘要：可以给界面线程看 */
export interface LocalSaveMeta {
  format: number;
  /** 引擎状态结构的版本（引擎包的 schema 版本） */
  engineSchema: number;
  playerCount: number;
  /** 对局回合数，仅用于提示文案 */
  turn: number;
  /** 每接受一步加 1 的版本号；摘要与状态里各存一份，用来确认两项是同一次写入 */
  stateID: number;
  savedAt: number;
}

export interface LocalSaveInput {
  playerCount: number;
  turn: number;
  stateID: number;
  /** 引擎的完整状态快照 */
  state: unknown;
}

export interface LocalSaveRecord extends LocalSaveMeta {
  state: unknown;
}

export interface LocalMatchSaves {
  /** 读摘要；没有、版本不匹配或读取出错返回 null（不匹配与出错时顺带清掉存档） */
  readMeta(): Promise<LocalSaveMeta | null>;
  /** 读完整存档（含引擎状态）；规则同上 */
  load(): Promise<LocalSaveRecord | null>;
  /** 写入存档；失败只记日志，不抛错 */
  save(input: LocalSaveInput): Promise<void>;
  /** 清除存档；失败只记日志，不抛错 */
  clear(): Promise<void>;
}

export interface LocalMatchSavesOptions {
  /** 当前引擎状态结构的版本；与存档里的不一致就丢弃 */
  engineSchema: number;
  now?: () => number;
}

function isMeta(value: unknown): value is LocalSaveMeta {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    Number.isInteger(m.format) &&
    Number.isInteger(m.engineSchema) &&
    Number.isInteger(m.playerCount) &&
    Number.isInteger(m.turn) &&
    Number.isInteger(m.stateID) &&
    typeof m.savedAt === 'number'
  );
}

/** 没有存储（IndexedDB 不可用）时的实现：什么都不存 */
export const NO_LOCAL_SAVES: LocalMatchSaves = {
  readMeta: async () => null,
  load: async () => null,
  save: async () => {},
  clear: async () => {},
};

export function createLocalMatchSaves(
  store: KeyValueStore | null,
  options: LocalMatchSavesOptions,
): LocalMatchSaves {
  if (store === null) return NO_LOCAL_SAVES;
  const now = options.now ?? Date.now;

  async function clear(): Promise<void> {
    try {
      await store!.delete(META_KEY, STATE_KEY);
    } catch (err) {
      logger.warn('storage', 'local save clear failed', err);
    }
  }

  async function readMeta(): Promise<LocalSaveMeta | null> {
    try {
      const meta = await store!.get<unknown>(META_KEY);
      if (meta === undefined) return null;
      if (
        !isMeta(meta) ||
        meta.format !== SAVE_FORMAT_VERSION ||
        meta.engineSchema !== options.engineSchema
      ) {
        logger.warn('storage', 'local save discarded: version mismatch or malformed', {
          format: (meta as Partial<LocalSaveMeta> | null)?.format,
          engineSchema: (meta as Partial<LocalSaveMeta> | null)?.engineSchema,
        });
        await clear();
        return null;
      }
      return meta;
    } catch (err) {
      logger.warn('storage', 'local save read failed, discarding', err);
      await clear();
      return null;
    }
  }

  return {
    readMeta,
    async load() {
      const meta = await readMeta();
      if (meta === null) return null;
      try {
        const stored = await store.get<{ stateID?: unknown; state?: unknown }>(STATE_KEY);
        if (stored === undefined || stored.stateID !== meta.stateID || stored.state == null) {
          logger.warn('storage', 'local save discarded: state missing or out of step with meta');
          await clear();
          return null;
        }
        return { ...meta, state: stored.state };
      } catch (err) {
        logger.warn('storage', 'local save state read failed, discarding', err);
        await clear();
        return null;
      }
    },
    async save(input) {
      const meta: LocalSaveMeta = {
        format: SAVE_FORMAT_VERSION,
        engineSchema: options.engineSchema,
        playerCount: input.playerCount,
        turn: input.turn,
        stateID: input.stateID,
        savedAt: now(),
      };
      try {
        await store.setMany([
          [STATE_KEY, { stateID: input.stateID, state: input.state }],
          [META_KEY, meta],
        ]);
      } catch (err) {
        logger.warn('storage', 'local save write failed', err);
      }
    },
    clear,
  };
}

/** 打开真实的 IndexedDB 存档；不可用时降级为不存档 */
export async function openLocalMatchSaves(
  options: LocalMatchSavesOptions,
): Promise<LocalMatchSaves> {
  const store = await openKeyValueStore({
    name: SAVE_DB_NAME,
    version: SAVE_DB_VERSION,
    storeName: SAVE_STORE_NAME,
  });
  return createLocalMatchSaves(store, options);
}
