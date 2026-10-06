// 人机对局本地存档的测试工具：直接读写浏览器里的 IndexedDB（库 icgame-local，仓库 saves）

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

export const SAVE_DB = 'icgame-local';
export const SAVE_STORE = 'saves';
export const META_KEY = 'local-match:meta';
export const STATE_KEY = 'local-match:state';

/** 读源码里的数字常量，用例里不另写数字 */
function readConstant(relative: string, name: string): number {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const match = new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(source);
  if (!match) throw new Error(`${relative} 里找不到 ${name}`);
  return Number(match[1]);
}

export const ENGINE_SCHEMA = readConstant(
  '../../../game-engine/src/migrations.ts',
  'CURRENT_SCHEMA_VERSION',
);
export const SAVE_FORMAT = readConstant(
  '../../../client/src/lib/localMatchSave.ts',
  'SAVE_FORMAT_VERSION',
);

export interface SeedMeta {
  format: number;
  engineSchema: number;
  playerCount: number;
  turn: number;
  stateID: number;
  savedAt: number;
}

/** 摘要合法的存档摘要 */
export function validMeta(over: Partial<SeedMeta> = {}): SeedMeta {
  return {
    format: SAVE_FORMAT,
    engineSchema: ENGINE_SCHEMA,
    playerCount: 5,
    turn: 3,
    stateID: 7,
    savedAt: Date.now(),
    ...over,
  };
}

/** 往存档库里写入摘要，以及（可选的）状态 */
export async function seedSave(page: Page, meta: SeedMeta, state?: unknown): Promise<void> {
  await page.evaluate(
    ([db, store, metaKey, stateKey, metaValue, stateValue]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(db as string, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(store as string);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(store as string, 'readwrite');
          const os = tx.objectStore(store as string);
          os.put(metaValue, metaKey as string);
          if (stateValue !== undefined) os.put(stateValue, stateKey as string);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [
      SAVE_DB,
      SAVE_STORE,
      META_KEY,
      STATE_KEY,
      meta,
      state === undefined ? undefined : { stateID: meta.stateID, state },
    ] as const,
  );
}

/** 读存档摘要里的回合数与版本号；没有存档返回 null */
export async function readSavedMeta(page: Page): Promise<{ turn: number; stateID: number } | null> {
  return page.evaluate(
    ([db, store, key]) =>
      new Promise<{ turn: number; stateID: number } | null>((resolve) => {
        const open = indexedDB.open(db as string, 1);
        open.onupgradeneeded = () => {
          // 库还不存在（尚未写过存档）：建出空仓库，读到 undefined
          open.result.createObjectStore(store as string);
        };
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const get = open.result
            .transaction(store as string, 'readonly')
            .objectStore(store as string)
            .get(key as string);
          get.onsuccess = () => {
            open.result.close();
            const v = get.result as { turn?: number; stateID?: number } | undefined;
            resolve(v ? { turn: v.turn ?? -1, stateID: v.stateID ?? -1 } : null);
          };
          get.onerror = () => resolve(null);
        };
      }),
    [SAVE_DB, SAVE_STORE, META_KEY] as const,
  );
}
