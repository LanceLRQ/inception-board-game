// 界面线程访问本地存档的入口：只读摘要与清除，不碰引擎状态
//
// 引擎的完整状态只在 Worker 里读写（见 workers/localMatchPersistence）；
// 这里读到的摘要只有人数、回合数与保存时间，没有任何对局内容。

import { CURRENT_SCHEMA_VERSION } from '@icgame/game-engine';
import { openLocalMatchSaves, type LocalMatchSaves, type LocalSaveMeta } from './localMatchSave';

async function withSaves<T>(run: (saves: LocalMatchSaves) => Promise<T>): Promise<T> {
  const saves = await openLocalMatchSaves({ engineSchema: CURRENT_SCHEMA_VERSION });
  return run(saves);
}

/** 读存档摘要；没有、版本不匹配或不可用时返回 null */
export function readLocalSaveMeta(): Promise<LocalSaveMeta | null> {
  return withSaves((saves) => saves.readMeta());
}

/** 清除本地存档 */
export function clearLocalSave(): Promise<void> {
  return withSaves((saves) => saves.clear());
}
