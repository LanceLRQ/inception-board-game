// shouldShowFlipButton 纯函数测试
// 对照：plans/design/06c-match-table-layout.md §6.2

import { describe, it, expect, vi } from 'vitest';

// 替换掉 cardImages.hasCardBackImage 的实际实现，避免依赖 manifest
vi.mock('../../lib/cardImages', () => ({
  getCardImageUrl: () => 'mock-front.webp',
  getCardBackImageUrl: (id: string) => (id === 'twin_card' ? 'mock-back.webp' : undefined),
  hasCardBackImage: (id: string | null | undefined) => id === 'twin_card',
}));

// 依赖 getCardName/getCharacterSkillSummary，mock 避免找不到模块内容
vi.mock('../../lib/cards', () => ({
  getCardName: (id: string) => id,
  getCharacterSkillSummary: () => null,
}));

import { shouldShowFlipButton } from './index.js';

describe('shouldShowFlipButton', () => {
  it('cardId=null 返回 false', () => {
    expect(shouldShowFlipButton(null)).toBe(false);
    expect(shouldShowFlipButton(null, true)).toBe(false);
  });

  it('单面卡返回 false', () => {
    expect(shouldShowFlipButton('single_card' as never)).toBe(false);
  });

  it('双面卡未禁用：返回 true', () => {
    expect(shouldShowFlipButton('twin_card' as never)).toBe(true);
    expect(shouldShowFlipButton('twin_card' as never, false)).toBe(true);
  });

  it('双面卡 disableFlip=true：返回 false', () => {
    expect(shouldShowFlipButton('twin_card' as never, true)).toBe(false);
  });
});
