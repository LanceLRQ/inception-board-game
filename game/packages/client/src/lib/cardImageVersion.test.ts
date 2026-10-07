// 卡图地址与清单的对应：带版本的地址、按地址取尺寸与朝向

import { describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
  logger: { warn: vi.fn(), flow: vi.fn(), ai: vi.fn(), error: vi.fn() },
}));

import { MASTER_CHARACTERS, THIEF_CHARACTERS } from '@icgame/shared';
import {
  cardImageInfo,
  cardImageSizeOfUrl,
  isLandscapeCardImageUrl,
  versionedCardImageUrl,
} from './cardImageVersion';

describe('versionedCardImageUrl', () => {
  it('清单里的卡图带上内容哈希作版本参数', () => {
    const path = THIEF_CHARACTERS[0]!.imagePath;
    const url = versionedCardImageUrl(path);
    expect(url).toBe(`/cards/${encodeURI(path)}?v=${cardImageInfo(path)!.hash}`);
  });

  it('不在清单里的路径退回不带版本的地址', () => {
    expect(versionedCardImageUrl('nowhere/x.webp')).toBe('/cards/nowhere/x.webp');
  });
});

describe('cardImageSizeOfUrl', () => {
  it('由带版本的地址取回清单里的宽高', () => {
    const path = THIEF_CHARACTERS[0]!.imagePath;
    const info = cardImageInfo(path)!;
    expect(cardImageSizeOfUrl(versionedCardImageUrl(path))).toEqual({
      width: info.width,
      height: info.height,
    });
  });

  it('不是卡图地址、或清单里没有时返回 undefined', () => {
    expect(cardImageSizeOfUrl(undefined)).toBeUndefined();
    expect(cardImageSizeOfUrl('/icons/a.png')).toBeUndefined();
    expect(cardImageSizeOfUrl('/cards/nowhere/x.webp?v=abc')).toBeUndefined();
    expect(cardImageSizeOfUrl('/cards/%E0%A4%A.webp')).toBeUndefined();
  });
});

describe('isLandscapeCardImageUrl', () => {
  it('梦主角色牌是横版，盗梦者角色牌是竖版', () => {
    for (const ch of MASTER_CHARACTERS) {
      expect(isLandscapeCardImageUrl(versionedCardImageUrl(ch.imagePath)), ch.id).toBe(true);
    }
    for (const ch of THIEF_CHARACTERS) {
      expect(isLandscapeCardImageUrl(versionedCardImageUrl(ch.imagePath)), ch.id).toBe(false);
    }
  });

  it('取不到尺寸时按竖版处理', () => {
    expect(isLandscapeCardImageUrl(undefined)).toBe(false);
    expect(isLandscapeCardImageUrl('/cards/nowhere/x.webp')).toBe(false);
  });
});
