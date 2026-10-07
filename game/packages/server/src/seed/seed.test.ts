import { describe, it, expect } from 'vitest';
import { CHAT_PRESETS } from '@icgame/shared';
import { ACHIEVEMENTS } from '../services/achievements.js';
import {
  buildAchievementRows,
  buildChatPhraseRows,
  runSeed,
  type AchievementRow,
  type ChatPhraseRow,
  type SeedStore,
} from './seed.js';

/** 内存替身：按主键保存行，行为与数据库的 upsert / 批量失效一致 */
class MemorySeedStore implements SeedStore {
  readonly phrases = new Map<string, ChatPhraseRow & { isActive: boolean }>();
  readonly achievements = new Map<string, AchievementRow>();

  async upsertChatPhrase(row: ChatPhraseRow): Promise<void> {
    this.phrases.set(row.id, { ...row, isActive: true });
  }

  async deactivateChatPhrasesExcept(keepIds: readonly string[]): Promise<number> {
    let n = 0;
    for (const [id, row] of this.phrases) {
      if (!keepIds.includes(id) && row.isActive) {
        this.phrases.set(id, { ...row, isActive: false });
        n += 1;
      }
    }
    return n;
  }

  async upsertAchievement(row: AchievementRow): Promise<void> {
    this.achievements.set(row.id, { ...row });
  }
}

describe('seed 数据构造', () => {
  it('预设短语行与 shared 清单逐条对应，中英文案直接取自清单', () => {
    const rows = buildChatPhraseRows();
    expect(rows).toHaveLength(CHAT_PRESETS.length);
    for (const [i, p] of CHAT_PRESETS.entries()) {
      expect(rows[i]).toEqual({
        id: p.id,
        category: p.category,
        textZhCn: p.textZh,
        textEnUs: p.textEn,
        displayOrder: p.displayOrder,
        availableFactions: p.availableFactions,
      });
    }
  });

  it('成就行与注册表逐条对应，字段不超过库里的列宽', () => {
    const rows = buildAchievementRows();
    expect(rows).toHaveLength(ACHIEVEMENTS.length);
    for (const [i, a] of ACHIEVEMENTS.entries()) {
      const row = rows[i]!;
      expect(row.id).toBe(a.id);
      expect(row.name).toBe(a.title);
      expect(row.description).toBe(a.description);
      expect(row.category).toBe(a.scope);
      expect(row.sort).toBe(i + 1);
      expect(row.id.length).toBeLessThanOrEqual(50);
      expect(row.name.length).toBeLessThanOrEqual(100);
      expect(row.description.length).toBeLessThanOrEqual(500);
      expect(row.category.length).toBeLessThanOrEqual(30);
    }
  });

  it('短语 id 与成就 id 各自唯一', () => {
    expect(new Set(buildChatPhraseRows().map((r) => r.id)).size).toBe(CHAT_PRESETS.length);
    expect(new Set(buildAchievementRows().map((r) => r.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('runSeed', () => {
  it('写入全部短语与成就并返回汇总', async () => {
    const store = new MemorySeedStore();
    const summary = await runSeed(store);
    expect(store.phrases.size).toBe(CHAT_PRESETS.length);
    expect([...store.phrases.values()].every((r) => r.isActive)).toBe(true);
    expect(store.achievements.size).toBe(ACHIEVEMENTS.length);
    expect(summary).toEqual({
      chatPhrases: CHAT_PRESETS.length,
      chatPhrasesDeactivated: 0,
      achievements: ACHIEVEMENTS.length,
    });
  });

  it('重复执行结果不变', async () => {
    const store = new MemorySeedStore();
    await runSeed(store);
    const phrases = structuredClone([...store.phrases.entries()]);
    const achievements = structuredClone([...store.achievements.entries()]);
    const again = await runSeed(store);
    expect([...store.phrases.entries()]).toEqual(phrases);
    expect([...store.achievements.entries()]).toEqual(achievements);
    expect(again.chatPhrasesDeactivated).toBe(0);
  });

  it('清单里已不存在的旧短语只标为停用，不删除', async () => {
    const store = new MemorySeedStore();
    await store.upsertChatPhrase({
      id: 'retired_phrase',
      category: 'greeting',
      textZhCn: '旧短语',
      textEnUs: 'old',
      displayOrder: 99,
      availableFactions: 'all',
    });
    const summary = await runSeed(store);
    expect(store.phrases.get('retired_phrase')?.isActive).toBe(false);
    expect(summary.chatPhrasesDeactivated).toBe(1);
    // 再跑一次：已停用的不再重复计数
    expect((await runSeed(store)).chatPhrasesDeactivated).toBe(0);
  });

  it('旧短语重新出现在清单里时恢复启用，并按清单更新文案', async () => {
    const store = new MemorySeedStore();
    const first = CHAT_PRESETS[0]!;
    store.phrases.set(first.id, {
      id: first.id,
      category: 'greeting',
      textZhCn: '旧文案',
      textEnUs: null,
      displayOrder: 0,
      availableFactions: 'all',
      isActive: false,
    });
    await runSeed(store);
    const row = store.phrases.get(first.id)!;
    expect(row.isActive).toBe(true);
    expect(row.textZhCn).toBe(first.textZh);
  });
});
