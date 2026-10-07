// 初始数据：预设短语与成就定义
//
// 数据来源都是代码里已有的唯一清单（shared 的预设短语、服务端的成就注册表），这里只做形状转换，
// 不另存一份文案。核心逻辑只依赖 SeedStore 接口，数据库实现与内存替身可互换；重复执行结果不变。

import { CHAT_PRESETS } from '@icgame/shared';
import { ACHIEVEMENTS } from '../services/achievements.js';

export interface ChatPhraseRow {
  id: string;
  category: string;
  textZhCn: string;
  textEnUs: string | null;
  displayOrder: number;
  availableFactions: string;
}

export interface AchievementRow {
  id: string;
  name: string;
  description: string;
  category: string;
  iconKey: string | null;
  isHidden: boolean;
  sort: number;
}

export interface SeedStore {
  /** 按 id 写入或更新一条预设短语，并保证它处于启用状态 */
  upsertChatPhrase(row: ChatPhraseRow): Promise<void>;
  /** 把不在 keepIds 里且仍启用的短语标为停用，返回被停用的条数；不删除（聊天记录有外键） */
  deactivateChatPhrasesExcept(keepIds: readonly string[]): Promise<number>;
  upsertAchievement(row: AchievementRow): Promise<void>;
}

export interface SeedSummary {
  chatPhrases: number;
  chatPhrasesDeactivated: number;
  achievements: number;
}

export function buildChatPhraseRows(): ChatPhraseRow[] {
  return CHAT_PRESETS.map((p) => ({
    id: p.id,
    category: p.category,
    textZhCn: p.textZh,
    textEnUs: p.textEn,
    displayOrder: p.displayOrder,
    availableFactions: p.availableFactions,
  }));
}

/** 成就注册表没有单独的分类，用它的归属范围（个人 / 阵营）作分类；排序按注册顺序 */
export function buildAchievementRows(): AchievementRow[] {
  return ACHIEVEMENTS.map((a, i) => ({
    id: a.id,
    name: a.title,
    description: a.description,
    category: a.scope,
    iconKey: null,
    isHidden: false,
    sort: i + 1,
  }));
}

export async function runSeed(store: SeedStore): Promise<SeedSummary> {
  const phrases = buildChatPhraseRows();
  for (const row of phrases) await store.upsertChatPhrase(row);
  const chatPhrasesDeactivated = await store.deactivateChatPhrasesExcept(phrases.map((r) => r.id));

  const achievements = buildAchievementRows();
  for (const row of achievements) await store.upsertAchievement(row);

  return {
    chatPhrases: phrases.length,
    chatPhrasesDeactivated,
    achievements: achievements.length,
  };
}
