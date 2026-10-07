// SeedStore 的数据库实现

import type { PrismaClient } from '../generated/prisma/client.js';
import type { AchievementRow, ChatPhraseRow, SeedStore } from './seed.js';

/** 只用到的最小接口；事务客户端与全局客户端都满足，也便于测试打桩 */
export interface PrismaSeedClient {
  chatPhrasePreset: Pick<PrismaClient['chatPhrasePreset'], 'upsert' | 'updateMany'>;
  achievement: Pick<PrismaClient['achievement'], 'upsert'>;
}

export function createPrismaSeedStore(db: PrismaSeedClient): SeedStore {
  return {
    async upsertChatPhrase(row: ChatPhraseRow): Promise<void> {
      const { id, ...fields } = row;
      await db.chatPhrasePreset.upsert({
        where: { id },
        create: { ...row, isActive: true },
        update: { ...fields, isActive: true },
      });
    },

    async deactivateChatPhrasesExcept(keepIds: readonly string[]): Promise<number> {
      const { count } = await db.chatPhrasePreset.updateMany({
        where: { id: { notIn: [...keepIds] }, isActive: true },
        data: { isActive: false },
      });
      return count;
    },

    async upsertAchievement(row: AchievementRow): Promise<void> {
      const { id, ...fields } = row;
      await db.achievement.upsert({ where: { id }, create: row, update: fields });
    },
  };
}
