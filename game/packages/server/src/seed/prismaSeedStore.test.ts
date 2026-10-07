import { describe, it, expect, vi } from 'vitest';
import { createPrismaSeedStore, type PrismaSeedClient } from './prismaSeedStore.js';

function stubClient() {
  const chatUpsert = vi.fn().mockResolvedValue({});
  const chatUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
  const achievementUpsert = vi.fn().mockResolvedValue({});
  const client = {
    chatPhrasePreset: { upsert: chatUpsert, updateMany: chatUpdateMany },
    achievement: { upsert: achievementUpsert },
  } as unknown as PrismaSeedClient;
  return { client, chatUpsert, chatUpdateMany, achievementUpsert };
}

describe('createPrismaSeedStore', () => {
  it('短语 upsert：新建与更新都带上全部字段，并写成启用', async () => {
    const { client, chatUpsert } = stubClient();
    const row = {
      id: 'greet_hi',
      category: 'greeting',
      textZhCn: '大家好！',
      textEnUs: 'Hello, everyone!',
      displayOrder: 1,
      availableFactions: 'all',
    };
    await createPrismaSeedStore(client).upsertChatPhrase(row);
    const rest = Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'id'));
    expect(chatUpsert).toHaveBeenCalledWith({
      where: { id: 'greet_hi' },
      create: { ...row, isActive: true },
      update: { ...rest, isActive: true },
    });
  });

  it('停用：只动不在清单里且仍启用的行，返回条数', async () => {
    const { client, chatUpdateMany } = stubClient();
    const n = await createPrismaSeedStore(client).deactivateChatPhrasesExcept(['a', 'b']);
    expect(n).toBe(2);
    expect(chatUpdateMany).toHaveBeenCalledWith({
      where: { id: { notIn: ['a', 'b'] }, isActive: true },
      data: { isActive: false },
    });
  });

  it('成就 upsert：按 id 更新，字段与行一致', async () => {
    const { client, achievementUpsert } = stubClient();
    const row = {
      id: 'first_kill',
      name: '首杀',
      description: 'd',
      category: 'individual',
      iconKey: null,
      isHidden: false,
      sort: 1,
    };
    await createPrismaSeedStore(client).upsertAchievement(row);
    const rest = Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'id'));
    expect(achievementUpsert).toHaveBeenCalledWith({
      where: { id: 'first_kill' },
      create: row,
      update: rest,
    });
  });
});
