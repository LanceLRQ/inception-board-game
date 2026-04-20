// 雅典娜 · 急智（thief_athena.skill_0）
// 对照：docs/manual/05-dream-thieves.md 雅典娜
// 同层盗梦者对你用行动牌时，可先抽弃牌堆 1 张。回合限 1 次（每个对手回合）
//
// abilities registry 接入：onActionPhase trigger（dispatcher 在他人出牌前调用）
// R1 阶段：apply 直接调用 applyAthenaWit 纯函数

import { applyAthenaWit, ATHENA_WIT_SKILL_ID } from '../../../skills.js';
import { canUse, incrementUsage } from '../../usage-counter.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { ATHENA_WIT_SKILL_ID };

export const athenaWit: AbilityDefinition = {
  id: ATHENA_WIT_SKILL_ID,
  name: 'character.thief_athena.skill_0.name',
  description: 'character.thief_athena.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  scopeLimit: 1,
  triggers: ['onActionPhase'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_athena') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    if (state.deck.discardPile.length === 0) return { ok: false, reason: 'discard_empty' };

    const limit = this.scopeLimit;
    const ok = canUse(
      state,
      { playerID: ctx.invokerID, abilityID: this.id, scope: this.scope! },
      limit,
      ctx.turnPhase,
    );
    if (!ok) return { ok: false, reason: 'usage_exhausted' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state: SetupState, ctx: AbilityContext) {
    const next = applyAthenaWit(state, ctx.invokerID);
    if (!next) return { state, events: [] };
    const counted = incrementUsage(
      next,
      { playerID: ctx.invokerID, abilityID: this.id, scope: this.scope! },
      ctx.turnPhase,
    );
    return {
      state: counted,
      events: [
        {
          type: 'athena_wit_drew',
          playerID: ctx.invokerID,
          timestamp: 0,
        },
      ],
    };
  },
};
