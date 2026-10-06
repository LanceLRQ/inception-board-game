import { describe, expect, it } from 'vitest';
import { GENERIC_BACK_IMAGES, getCardImageUrl } from '../../lib/cardImages';
import { CATEGORY_TONE, artFallbackFor } from './fallback';

describe('artFallbackFor', () => {
  it('已登记的卡图：卡名与类别都查得到', () => {
    const fb = artFallbackFor(getCardImageUrl('action_shoot'));
    expect(fb.category).toBe('action');
    expect(fb.name).toBe('SHOOT');
  });

  it('调用方给的文字优先于按地址查到的卡名', () => {
    expect(artFallbackFor(getCardImageUrl('action_shoot'), '自定义').name).toBe('自定义');
  });

  it('通用背面：没有卡名，但有类别', () => {
    expect(artFallbackFor(GENERIC_BACK_IMAGES.thief)).toEqual({ category: 'thief', name: null });
    expect(artFallbackFor(GENERIC_BACK_IMAGES.master).category).toBe('dream-master');
  });

  it('不是卡图的地址或没有地址：类别也没有，文字用调用方给的', () => {
    expect(artFallbackFor(undefined)).toEqual({ category: null, name: null });
    expect(artFallbackFor('/x.png', '文字')).toEqual({ category: null, name: '文字' });
  });

  it('每个类别都有令牌配色，且只用语义令牌（没有调色板类名与颜色字面量）', () => {
    for (const tone of Object.values(CATEGORY_TONE)) {
      expect(tone).not.toMatch(/\b(?:bg|text)-(?:red|blue|green|gray|white|black)\b/);
      expect(tone).not.toMatch(/#|rgb|hsl/);
    }
    expect(Object.keys(CATEGORY_TONE)).toHaveLength(8);
  });
});
