import { describe, expect, it } from 'vitest';
import { buildCardCatalog, tierOf } from './cardCatalog';
import { getCardImageCatalog, GENERIC_BACK_IMAGES } from './cardImages';

describe('tierOf', () => {
  it('背面与金库是界面必需的；行动牌、梦魇是每局都要的全集；其余等空闲', () => {
    expect(tierOf('vault_gold', 'vault')).toBe('critical');
    expect(tierOf('bribe_back', 'bribe')).toBe('critical');
    expect(tierOf('action_shoot', 'action')).toBe('match-entry');
    expect(tierOf('nightmare_echo', 'nightmare')).toBe('match-entry');
    expect(tierOf('thief_pisces', 'thief')).toBe('idle');
    expect(tierOf('dm_chess', 'dream-master')).toBe('idle');
    expect(tierOf('bribe_success', 'bribe')).toBe('idle');
  });
});

describe('buildCardCatalog', () => {
  const entries = buildCardCatalog();

  it('覆盖全部已登记的卡图与两张通用背面，图片地址不重复', () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(GENERIC_BACK_IMAGES.thief);
    expect(urls).toContain(GENERIC_BACK_IMAGES.master);
    for (const rec of getCardImageCatalog()) expect(urls).toContain(rec.url);
  });

  it('所有地址都在 /cards/ 下，且是 webp', () => {
    for (const e of entries) {
      expect(e.url.startsWith('/cards/')).toBe(true);
      expect(e.url).toMatch(/\.webp$/);
    }
  });

  it('进站只取关键素材：数量很少，都是背面或金库', () => {
    const critical = entries.filter((e) => e.tier === 'critical');
    expect(critical.length).toBeGreaterThanOrEqual(5);
    expect(critical.length).toBeLessThan(15);
    expect(critical.some((e) => e.id === 'generic_thief_back')).toBe(true);
  });

  it('进对局前的全集只有行动牌与梦魇，不含任何角色牌（角色按视图里可见的取）', () => {
    const entry = entries.filter((e) => e.tier === 'match-entry');
    expect(entry.length).toBeGreaterThan(15);
    expect(entry.every((e) => e.category === 'action' || e.category === 'nightmare')).toBe(true);
  });

  it('角色牌都在空闲档', () => {
    const chars = entries.filter((e) => e.category === 'thief' || e.category === 'dream-master');
    expect(chars.length).toBeGreaterThan(40);
    expect(chars.every((e) => e.tier === 'idle' || e.tier === 'critical')).toBe(true);
  });
});
