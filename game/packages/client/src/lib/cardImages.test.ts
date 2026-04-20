import { describe, it, expect } from 'vitest';
import { getCardImageUrl, getCardImageCount } from './cardImages.js';

describe('cardImages', () => {
  describe('getCardImageUrl', () => {
    it('returns a /cards/-prefixed .webp URL for a known thief character', () => {
      const url = getCardImageUrl('thief_space_queen');
      expect(url).toBeDefined();
      expect(url).toMatch(/^\/cards\//);
      expect(url).toMatch(/\.webp$/);
    });

    it('returns a URL for a known action card', () => {
      const url = getCardImageUrl('action_shoot');
      expect(url).toBeDefined();
      expect(url).toMatch(/\.webp$/);
    });

    it('returns undefined for unknown cardId', () => {
      expect(getCardImageUrl('nonexistent_card_xxx')).toBeUndefined();
    });

    it('returns undefined for null / empty / undefined', () => {
      expect(getCardImageUrl(null)).toBeUndefined();
      expect(getCardImageUrl(undefined)).toBeUndefined();
      expect(getCardImageUrl('')).toBeUndefined();
    });

    it('encodes Chinese filename characters safely', () => {
      const url = getCardImageUrl('thief_space_queen');
      // encodeURI 保留中文字符原样（其实是 %XX 转义）；至少不能有原始空格或其它非法 URI 字符
      expect(url).not.toMatch(/\s/);
    });
  });

  describe('getCardImageCount', () => {
    it('has at least 75 registered cards (37 thief + 15 master + 21 action + ...)', () => {
      // 大致范围校验，避免对精确数字耦合
      expect(getCardImageCount()).toBeGreaterThanOrEqual(75);
    });
  });
});
