import { describe, expect, it } from 'vitest';
import {
  CHAT_BUBBLE_VISIBLE_MS,
  CHAT_COOLDOWN_MS,
  CHAT_HISTORY_LIMIT,
  CHAT_PRESETS,
  findChatPreset,
  getChatPresetsByCategory,
  isPresetAvailableForFaction,
  isValidChatPresetId,
} from './presets.js';

describe('预设短语', () => {
  it('id 与 i18n 键各自唯一，键都在 chat. 下', () => {
    expect(new Set(CHAT_PRESETS.map((p) => p.id)).size).toBe(CHAT_PRESETS.length);
    expect(new Set(CHAT_PRESETS.map((p) => p.i18nKey)).size).toBe(CHAT_PRESETS.length);
    for (const p of CHAT_PRESETS) {
      expect(p.i18nKey.startsWith('chat.')).toBe(true);
    }
  });

  it('文案不带 emoji', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const p of CHAT_PRESETS) {
      expect(emoji.test(p.textZh)).toBe(false);
      expect(emoji.test(p.textEn)).toBe(false);
    }
  });

  it('按 id 查找与校验；未知 id 不存在', () => {
    expect(findChatPreset('greet_hi')?.textZh).toBe('大家好！');
    expect(isValidChatPresetId('greet_hi')).toBe(true);
    expect(isValidChatPresetId('hello world')).toBe(false);
    expect(isValidChatPresetId('')).toBe(false);
  });

  it('阵营可见性：all 谁都能发，thief 专用的梦主发不了', () => {
    const all = findChatPreset('greet_hi')!;
    const thiefOnly = findChatPreset('tactic_push')!;
    expect(isPresetAvailableForFaction(all, 'master')).toBe(true);
    expect(isPresetAvailableForFaction(thiefOnly, 'thief')).toBe(true);
    expect(isPresetAvailableForFaction(thiefOnly, 'master')).toBe(false);
  });

  it('按类别取出并按显示顺序排列', () => {
    for (const cat of ['greeting', 'tactic', 'emotion', 'feedback'] as const) {
      const list = getChatPresetsByCategory(cat);
      expect(list.length).toBeGreaterThan(0);
      expect(list.map((p) => p.displayOrder)).toEqual(
        [...list.map((p) => p.displayOrder)].sort((a, b) => a - b),
      );
    }
  });

  it('时间与条数常量', () => {
    expect(CHAT_COOLDOWN_MS).toBe(3_000);
    expect(CHAT_BUBBLE_VISIBLE_MS).toBeGreaterThan(CHAT_COOLDOWN_MS);
    expect(CHAT_HISTORY_LIMIT).toBeGreaterThan(0);
  });
});
