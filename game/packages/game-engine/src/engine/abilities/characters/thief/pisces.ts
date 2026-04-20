// 双鱼 · 闪避（thief_pisces.skill_0，双面）
// 对照：docs/manual/05-dream-thieves.md 双鱼
// 被 SHOOT 时可移到上一层并翻面，回合限 1 次
//
// abilities registry 接入：onBeforeShoot — target 响应窗口
// R1 阶段：定义 + canActivate；apply 调用 applyPiscesEvade 纯函数

import { applyPiscesEvade, canPiscesEvade, PISCES_SKILL_ID } from '../../../skills.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { PISCES_SKILL_ID, canPiscesEvade };

export const piscesEvade: AbilityDefinition = {
  id: PISCES_SKILL_ID,
  name: 'character.thief_pisces.skill_0.name',
  description: 'character.thief_pisces.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  scopeLimit: 1,
  triggers: ['onBeforeShoot'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (!canPiscesEvade(player)) return { ok: false, reason: 'condition_not_met' };
    if (!ctx.pendingShoot) return { ok: false, reason: 'no_pending_shoot' };
    if (ctx.pendingShoot.targetID !== ctx.invokerID) return { ok: false, reason: 'not_target' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state: SetupState, ctx: AbilityContext) {
    const next = applyPiscesEvade(state, ctx.invokerID);
    if (!next) return { state, events: [] };
    return {
      state: next,
      events: [
        {
          type: 'pisces_evade_resolved',
          playerID: ctx.invokerID,
          timestamp: 0,
        },
      ],
    };
  },
};
