// 生成配置里的每个图片路径，都要对应 public/cards/ 下真实存在的文件
import { describe, it, expect } from 'vitest';
import {
  ACTION_CARDS,
  BRIBE_CARDS,
  CARD_BACK_IMAGES,
  DREAM_CARDS,
  MASTER_CHARACTERS,
  NIGHTMARE_CARDS,
  OTHER_CARDS,
  THIEF_CHARACTERS,
  VAULT_CARDS,
} from '@icgame/shared';

// 只取文件清单，不加载内容（键是相对本文件的路径）
const KEY_PREFIX = '../../public/cards/';
const FILES = new Set(Object.keys(import.meta.glob('../../public/cards/**/*.webp')));
const exists = (relPath: string): boolean => FILES.has(KEY_PREFIX + relPath);

describe('卡图文件', () => {
  it('每张牌的正面（与双面角色的背面）图片都存在', () => {
    const missing: string[] = [];
    const cards = [
      ...THIEF_CHARACTERS,
      ...MASTER_CHARACTERS,
      ...ACTION_CARDS,
      ...NIGHTMARE_CARDS,
      ...DREAM_CARDS,
      ...VAULT_CARDS,
      ...BRIBE_CARDS,
      ...OTHER_CARDS,
    ];
    expect(FILES.size).toBeGreaterThan(80);
    expect(cards.length).toBeGreaterThan(80);
    for (const c of cards) {
      const paths = [c.imagePath, 'backImagePath' in c ? c.backImagePath : undefined];
      for (const p of paths) {
        if (p && !exists(p)) missing.push(`${c.id}: ${p}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('各类通用背面图都存在', () => {
    for (const [kind, p] of Object.entries(CARD_BACK_IMAGES)) {
      expect(exists(p), `${kind}: ${p}`).toBe(true);
    }
  });
});
