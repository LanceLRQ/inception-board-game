// getCharacterSkillSummary：角色牌的技能与世界观摘要（卡牌详情用）

import { describe, expect, it } from 'vitest';
import { MASTER_CHARACTERS, THIEF_CHARACTERS } from '@icgame/shared';
import { getCharacterSkillSummary } from './cards';

describe('getCharacterSkillSummary', () => {
  it('梦主带技能与世界观', () => {
    for (const ch of MASTER_CHARACTERS) {
      const summary = getCharacterSkillSummary(ch.id);
      expect(summary?.name, ch.id).toBe(ch.name);
      expect(summary?.skills.length, ch.id).toBeGreaterThan(0);
      expect(summary?.worldView, ch.id).toEqual({
        name: ch.front.worldView!.name,
        description: ch.front.worldView!.description,
      });
    }
  });

  it('盗梦者只有技能，没有世界观', () => {
    const ch = THIEF_CHARACTERS[0]!;
    const summary = getCharacterSkillSummary(ch.id);
    expect(summary?.skills.map((s) => s.name)).toEqual(ch.front.skills.map((s) => s.name));
    expect(summary?.worldView).toBeUndefined();
  });

  it('不是角色牌返回 null', () => {
    expect(getCharacterSkillSummary('action_shoot')).toBeNull();
    expect(getCharacterSkillSummary('nope')).toBeNull();
  });
});
