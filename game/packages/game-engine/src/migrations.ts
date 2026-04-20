// Schema 版本化与迁移框架
// 确保旧版 GameState 可以平滑升级到新版

import type { SetupState } from './setup.js';

export const CURRENT_SCHEMA_VERSION = 2;

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

// 迁移链：按版本号顺序排列
const MIGRATIONS: Map<number, Migration> = new Map([
  // v1 → v2：添加 pendingLibra（天秤）+ mazeState（筑梦师·迷宫）字段
  [
    2,
    (state) => ({
      ...state,
      pendingLibra: state.pendingLibra ?? null,
      mazeState: state.mazeState ?? null,
    }),
  ],
]);

// 将任意 GameState 迁移到当前版本
export function migrateGameState(raw: Record<string, unknown>): SetupState {
  let state = { ...raw };
  let version = (state.schemaVersion as number) ?? 0;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.get(version + 1);
    if (migration) {
      state = migration(state);
    }
    version++;
    state.schemaVersion = version;
  }

  // 确保 moveCounter 和 schemaVersion 存在
  if (state.moveCounter === undefined) {
    state.moveCounter = 0;
  }
  state.schemaVersion = CURRENT_SCHEMA_VERSION;

  return state as unknown as import('./setup.js').SetupState;
}

// 获取当前 schema 版本
export function getSchemaVersion(): number {
  return CURRENT_SCHEMA_VERSION;
}
