// 小丑 · 赌博（thief_joker.skill_0）
// 对照：docs/manual/05-dream-thieves.md 小丑
// 略过抽牌阶段时可掷骰 → 抽 = 骰值（1-6）；下回合 discard 必须全弃
//
// abilities registry 接入：onDrawPhase trigger（替代默认 doDraw 流程）
// R2 阶段：定义 + canActivate；apply 调用 jokerDrawCount，drawCards 由 dispatcher 在 R3 落地

import { jokerDrawCount, JOKER_SKILL_ID } from '../../../skills.js';
import { canUse, incrementUsage } from '../../usage-counter.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { JOKER_SKILL_ID, jokerDrawCount };

export const jokerGamble: AbilityDefinition = {
  id: JOKER_SKILL_ID,
  name: 'character.thief_joker.skill_0.name',
  description: 'character.thief_joker.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  scopeLimit: 1,
  triggers: ['onDrawPhase'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_joker') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    if (ctx.turnPhase !== 'draw') return { ok: false, reason: 'wrong_phase' };
    const ok = canUse(
      state,
      { playerID: ctx.invokerID, abilityID: this.id, scope: 'perTurn' },
      this.scopeLimit,
      ctx.turnPhase,
    );
    if (!ok) return { ok: false, reason: 'usage_exhausted' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state: SetupState, ctx: AbilityContext) {
    const roll = ctx.d6 ? ctx.d6() : 1;
    const count = jokerDrawCount(roll);
    const next = incrementUsage(
      state,
      { playerID: ctx.invokerID, abilityID: this.id, scope: 'perTurn' },
      ctx.turnPhase,
    );
    return {
      state: next,
      events: [
        {
          type: 'joker_gamble_resolved',
          playerID: ctx.invokerID,
          timestamp: 0,
          data: { roll, drawCount: count },
        },
      ],
    };
  },
};
