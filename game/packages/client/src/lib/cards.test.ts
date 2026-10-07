import { describe, it, expect } from 'vitest';
import { ACTION_CARDS } from '@icgame/shared';
import { isCardForPlayMove } from '@icgame/game-engine';
import { actionMoveFor, getCharacterSkillSummary } from './cards';

describe('actionMoveFor', () => {
  it('routes the assassin and the drill to their own moves', () => {
    expect(actionMoveFor('action_shoot_assassin')?.move).toBe('playShootKing');
    expect(actionMoveFor('action_shoot_drill')?.move).toBe('playShootArmor');
  });

  it('only returns a move that the engine accepts for that card', () => {
    for (const def of ACTION_CARDS) {
      const spec = actionMoveFor(def.id);
      if (!spec) continue;
      expect(isCardForPlayMove(spec.move, def.id as never), def.id).toBe(true);
    }
  });

  it('梦境窥视：盗梦者走效果①（选层），梦主走效果②（选玩家），都是引擎接受的 move', () => {
    expect(actionMoveFor('action_dream_peek')).toEqual({
      move: 'playPeek',
      needsTarget: 'layer',
      argOrder: 'card_first',
    });
    expect(actionMoveFor('action_dream_peek', 'master')).toEqual({
      move: 'playPeekMaster',
      needsTarget: 'player',
      argOrder: 'card_first',
    });
    expect(isCardForPlayMove('playPeekMaster', 'action_dream_peek' as never)).toBe(true);
  });

  it('has no generic shoot fallback for cards without a dedicated move', () => {
    expect(actionMoveFor('action_death_decree_3')).toBeNull();
    expect(actionMoveFor('action_death_decree_4')).toBeNull();
    expect(actionMoveFor('action_death_decree_5')).toBeNull();
  });
});

describe('getCharacterSkillSummary · 双面角色', () => {
  it.each([
    ['thief_gemini', 'thief_gemini_back', '命运', '抉择'],
    ['thief_pisces', 'thief_pisces_back', '游离', '洗礼'],
    ['thief_luna', 'thief_luna_back', '月蚀', '满月'],
  ])('%s 正面是 %s 的另一面，各自显示本面的技能', (front, back, frontSkill, backSkill) => {
    const f = getCharacterSkillSummary(front);
    const b = getCharacterSkillSummary(back);
    expect(f?.skills.map((s) => s.name)).toEqual([frontSkill]);
    expect(b).not.toBeNull();
    expect(b?.skills.map((s) => s.name)).toEqual([backSkill]);
  });
});
