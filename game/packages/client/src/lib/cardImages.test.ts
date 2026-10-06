import { describe, it, expect } from 'vitest';
import {
  getCardImageUrl,
  getCardImageCount,
  getCardBackImageUrl,
  hasCardBackImage,
  getCardImageCatalog,
  categoryOfImageUrl,
  lookupCardImageUrl,
  GENERIC_BACK_IMAGES,
} from './cardImages.js';

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

  describe('双面角色翻面后的 id', () => {
    it.each(['thief_gemini', 'thief_pisces', 'thief_luna'])('%s_back 显示背面卡图', (front) => {
      const frontUrl = getCardImageUrl(front);
      const backUrl = getCardImageUrl(`${front}_back`);
      expect(backUrl).toBeDefined();
      expect(backUrl).not.toBe(frontUrl);
      expect(backUrl).toBe(getCardBackImageUrl(front));
      // 翻面预览：背面的「另一面」就是正面
      expect(getCardBackImageUrl(`${front}_back`)).toBe(frontUrl);
      expect(hasCardBackImage(`${front}_back`)).toBe(true);
    });
  });

  describe('getCardImageCount', () => {
    it('has at least 75 registered cards (37 thief + 15 master + 21 action + ...)', () => {
      // 大致范围校验，避免对精确数字耦合
      expect(getCardImageCount()).toBeGreaterThanOrEqual(75);
    });
  });

  describe('getCardImageCatalog', () => {
    it('每张已登记的卡一条，带分类，图片地址与 getCardImageUrl 一致', () => {
      const catalog = getCardImageCatalog();
      expect(catalog.length).toBe(getCardImageCount());
      for (const rec of catalog) expect(rec.url).toBe(getCardImageUrl(rec.id));
      const categories = new Set(catalog.map((c) => c.category));
      for (const c of ['thief', 'dream-master', 'action', 'nightmare', 'vault', 'bribe']) {
        expect(categories.has(c as never)).toBe(true);
      }
    });

    it('分类与地址里的目录一致', () => {
      for (const rec of getCardImageCatalog()) {
        expect(categoryOfImageUrl(rec.url)).toBe(rec.category);
      }
    });
  });

  describe('lookupCardImageUrl / categoryOfImageUrl', () => {
    it('登记过的图能反查到卡牌 id', () => {
      const url = getCardImageUrl('action_shoot');
      expect(lookupCardImageUrl(url)).toEqual({ id: 'action_shoot', category: 'action' });
    });

    it('通用背面没有卡牌 id，但能读出分类', () => {
      expect(lookupCardImageUrl(GENERIC_BACK_IMAGES.thief)).toBeNull();
      expect(categoryOfImageUrl(GENERIC_BACK_IMAGES.thief)).toBe('thief');
      expect(categoryOfImageUrl(GENERIC_BACK_IMAGES.master)).toBe('dream-master');
    });

    it('不是卡图地址时得到 null', () => {
      expect(lookupCardImageUrl(undefined)).toBeNull();
      expect(categoryOfImageUrl('/pwa-192x192.png')).toBeNull();
      expect(categoryOfImageUrl(undefined)).toBeNull();
    });
  });
});
