import { get, set, del, keys } from 'idb-keyval';

const SAVE_PREFIX = 'icgame_save_';

export interface LocalSave {
  matchId: string;
  playerCount: number;
  savedAt: number;
  gameState: unknown;
}

export async function saveLocalMatch(save: LocalSave): Promise<void> {
  await set(`${SAVE_PREFIX}${save.matchId}`, save);
}

export async function loadLocalMatch(matchId: string): Promise<LocalSave | undefined> {
  return get<LocalSave>(`${SAVE_PREFIX}${matchId}`);
}

export async function deleteLocalMatch(matchId: string): Promise<void> {
  await del(`${SAVE_PREFIX}${matchId}`);
}

export async function listLocalSaves(): Promise<LocalSave[]> {
  const allKeys = await keys();
  const saveKeys = allKeys.filter((k) => String(k).startsWith(SAVE_PREFIX));
  const saves: LocalSave[] = [];
  for (const k of saveKeys) {
    const save = await get<LocalSave>(k);
    if (save) saves.push(save);
  }
  return saves.sort((a, b) => b.savedAt - a.savedAt);
}
