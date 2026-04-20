import { describe, it, expect } from 'vitest';
import {
  getCardImageUrl,
  getCardImageCount,
  getAllCardImageUrls,
  preloadAllCardImages,
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

  describe('getCardImageCount', () => {
    it('has at least 75 registered cards (37 thief + 15 master + 21 action + ...)', () => {
      // 大致范围校验，避免对精确数字耦合
      expect(getCardImageCount()).toBeGreaterThanOrEqual(75);
    });
  });

  describe('getAllCardImageUrls', () => {
    it('includes generic back images (thief + master)', () => {
      const urls = getAllCardImageUrls().map(decodeURI);
      expect(urls.some((u) => u.includes('盗梦者_背面'))).toBe(true);
      expect(urls.some((u) => u.includes('梦主_背面'))).toBe(true);
    });

    it('contains front urls for all registered cards', () => {
      const urls = getAllCardImageUrls();
      // >= count + 2（含双面卡背 + 2 通用背面）
      expect(urls.length).toBeGreaterThanOrEqual(getCardImageCount() + 2);
    });

    it('all URLs start with /cards/', () => {
      for (const url of getAllCardImageUrls()) {
        expect(url.startsWith('/cards/')).toBe(true);
      }
    });
  });

  describe('preloadAllCardImages', () => {
    it('resolves with loaded/failed stats in SSR-safe fallback (no Image ctor)', async () => {
      // jsdom 提供 Image；stub 让 onload 同步触发
      const OriginalImage = globalThis.Image;
      class FakeImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          // 下一 tick 触发 onload
          queueMicrotask(() => this.onload?.());
        }
      }
      // @ts-expect-error stub for test
      globalThis.Image = FakeImage;
      const result = await preloadAllCardImages({ concurrency: 4 });
      expect(result.loaded).toBeGreaterThan(0);
      expect(Array.isArray(result.failed)).toBe(true);
      globalThis.Image = OriginalImage;
    });
  });
});
