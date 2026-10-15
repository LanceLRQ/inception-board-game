import { describe, expect, it } from 'vitest';
import { getCardImageUrl, GENERIC_BACK_IMAGES } from '../../lib/cardImages';
import { hasScanBorder } from './scanBorder';

describe('hasScanBorder', () => {
  it('行动牌、梦魇、金库、梦境层与梦主角色牌的扫描件四周有黑边', () => {
    for (const id of ['action_shoot', 'action_unlock', 'dm_harbor', 'dream_1']) {
      const url = getCardImageUrl(id);
      expect(url, id).toBeTruthy();
      expect(hasScanBorder(url!), id).toBe(true);
    }
  });

  it('盗梦者角色牌正面是满版，没有黑边', () => {
    for (const id of ['thief_aries', 'thief_gemini', 'thief_gemini_back']) {
      const url = getCardImageUrl(id);
      expect(url, id).toBeTruthy();
      expect(hasScanBorder(url!), id).toBe(false);
    }
  });

  it('盗梦者的通用背面有黑边；地址带版本参数或经过编码也能判断', () => {
    expect(hasScanBorder(GENERIC_BACK_IMAGES.thief)).toBe(true);
    const raw = '/cards/thief/盗梦都市_角色牌_盗梦者_白羊.webp';
    expect(hasScanBorder(`${encodeURI(raw)}?v=abc`)).toBe(false);
  });
});
