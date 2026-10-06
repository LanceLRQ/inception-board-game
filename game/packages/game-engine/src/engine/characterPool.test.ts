// 开局角色池必须覆盖共享卡牌数据里的全部盗梦者角色，以后新增角色漏加会在这里失败。
import { describe, it, expect } from 'vitest';
import { THIEF_CHARACTERS } from '@icgame/shared';
import { THIEF_POOL } from './characterPool.js';

describe('开局盗梦者角色池', () => {
  it('与 THIEF_CHARACTERS 逐个对账：不缺、不多、不重复', () => {
    const all = THIEF_CHARACTERS.map((c) => c.id).sort();
    expect([...THIEF_POOL].sort()).toEqual(all);
    expect(new Set(THIEF_POOL).size).toBe(THIEF_POOL.length);
  });

  it('包含巨蟹', () => {
    expect(THIEF_POOL).toContain('thief_cancer');
  });
});
