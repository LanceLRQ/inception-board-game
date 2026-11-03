import { describe, expect, it } from 'vitest';
import { cardImageInfo } from '../../lib/cardImageVersion';
import content from './content.json';

describe('正式游戏说明书', () => {
  it('覆盖 103 张原卡与九章规则，所有卡牌都有正式素材和完整文字', () => {
    const cards = Object.values(content.cards);
    expect(cards).toHaveLength(103);
    expect(content.chapters).toHaveLength(9);
    for (const card of cards) {
      expect(cardImageInfo(card.imagePath), card.id).toBeTruthy();
      expect(card.fullText.trim().length, card.id).toBeGreaterThan(0);
    }
  });
  it('保留窥视与贿赂的规则正文', () => {
    expect(content.cards.action_dream_peek.fullText).toContain('金库');
    expect(content.cards.action_dream_peek.fullText).toContain('贿赂');
  });
});
