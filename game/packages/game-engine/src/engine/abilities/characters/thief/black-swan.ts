// 黑天鹅 · 巡演（thief_black_swan.skill_0）
// 对照：docs/manual/05-dream-thieves.md 黑天鹅
// 略过抽牌阶段，分发所有手牌（≥1）给任意盗梦者，抽 4 张
//
// abilities registry 接入：onDrawPhase trigger（替代默认 doDraw）
// inputs.distribution: Record<recvId, CardID[]>

import { applyBlackSwanTour, BLACK_SWAN_SKILL_ID } from '../../../skills.js';
import type { CardID } from '@icgame/shared';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { BLACK_SWAN_SKILL_ID, applyBlackSwanTour };

export const blackSwanTour: AbilityDefinition = {
  id: BLACK_SWAN_SKILL_ID,
  name: 'character.thief_black_swan.skill_0.name',
  description: 'character.thief_black_swan.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  scopeLimit: 1,
  triggers: ['onDrawPhase'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_black_swan') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    if (player.hand.length === 0) return { ok: false, reason: 'no_hand' };
    if (ctx.turnPhase !== 'draw') return { ok: false, reason: 'wrong_phase' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [
      {
        name: 'distribution',
        kind: 'choice',
        prompt: 'character.thief_black_swan.skill_0.distribution',
      },
    ];
  },

  apply(state: SetupState, ctx: AbilityContext, inputs) {
    const distribution = (inputs.distribution as Record<string, CardID[]>) ?? {};
    const next = applyBlackSwanTour(state, ctx.invokerID, distribution);
    if (!next) return { state, events: [] };
    return {
      state: next,
      events: [
        {
          type: 'black_swan_tour_resolved',
          playerID: ctx.invokerID,
          timestamp: 0,
          data: { distribution },
        },
      ],
    };
  },
};
