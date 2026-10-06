import { describe, it, expect } from 'vitest';
import { ACTION_CARDS } from '@icgame/shared';
import { isCardForPlayMove } from '@icgame/game-engine';
import { actionMoveFor } from './cards';

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

  it('has no generic shoot fallback for cards without a dedicated move', () => {
    expect(actionMoveFor('action_death_decree_3')).toBeNull();
    expect(actionMoveFor('action_death_decree_4')).toBeNull();
    expect(actionMoveFor('action_death_decree_5')).toBeNull();
  });
});
