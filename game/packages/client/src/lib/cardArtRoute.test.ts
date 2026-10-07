import { describe, it, expect } from 'vitest';
import { CARD_ART_URL_PATTERN, isCardArtRequest } from './cardArtRoute';
import { getCardImageCatalog, GENERIC_BACK_IMAGES } from './cardImages';
import { CARD_IMAGE_MANIFEST } from './generated/cardImageManifest';
import { versionedCardImageUrl } from './cardImageVersion';

const ORIGIN = 'https://example.test';

describe('卡图运行时缓存路由', () => {
  it('带版本参数的卡图地址（含中文文件名的转义）照样命中', () => {
    for (const rec of getCardImageCatalog()) {
      expect(isCardArtRequest(new URL(rec.url, ORIGIN)), rec.url).toBe(true);
      if (rec.backUrl) expect(isCardArtRequest(new URL(rec.backUrl, ORIGIN))).toBe(true);
    }
    expect(isCardArtRequest(new URL(GENERIC_BACK_IMAGES.thief, ORIGIN))).toBe(true);
    expect(isCardArtRequest(new URL(GENERIC_BACK_IMAGES.master, ORIGIN))).toBe(true);
  });

  it('不带参数的卡图地址、大小写不同的扩展名也命中', () => {
    expect(isCardArtRequest(new URL('/cards/action/x.webp', ORIGIN))).toBe(true);
    expect(isCardArtRequest(new URL('/cards/action/x.WEBP?v=1', ORIGIN))).toBe(true);
  });

  it('不是卡图的请求不命中', () => {
    expect(isCardArtRequest(new URL('/pwa-192x192.png', ORIGIN))).toBe(false);
    expect(isCardArtRequest(new URL('/assets/index.webp', ORIGIN))).toBe(false);
    expect(isCardArtRequest(new URL('/cards/action/x.jpg?v=1', ORIGIN))).toBe(false);
    // 查询串里出现 .webp 不算
    expect(isCardArtRequest(new URL('/api/x?file=/cards/a.webp', ORIGIN))).toBe(false);
  });

  it('匹配器是自包含的正则字面量：toString() 之后单独还原仍然可用（Workbox 把它写进 Service Worker）', () => {
    const restored = new Function(`return ${CARD_ART_URL_PATTERN.toString()}`)() as RegExp;
    expect(restored.test('https://example.test/cards/action/x.webp?v=0123456789')).toBe(true);
    expect(restored.test('https://example.test/pwa-192x192.png')).toBe(false);
  });

  it('卡图地址的版本参数就是清单里的哈希', () => {
    const [path, entry] = Object.entries(CARD_IMAGE_MANIFEST)[0]!;
    const url = versionedCardImageUrl(path);
    expect(url.endsWith(`?v=${entry.hash}`)).toBe(true);
  });
});
