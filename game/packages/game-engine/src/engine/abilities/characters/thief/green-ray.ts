// 格林射线 · 移转（thief_green_ray.skill_0）
// 对照：docs/manual/05-dream-thieves.md 格林射线
// 弃 1 梦境穿梭剂 + 1 SHOOT → 移到任意层 + 执行 SHOOT 效果
//
// abilities registry 接入：onActionPhase trigger
// R3 阶段：canActivate 校验弃牌组合；apply 的效果链（移动 + SHOOT）留待 R4 响应窗口整合

import { canGreenRayActivate, GREEN_RAY_SKILL_ID } from '../../../skills.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { GREEN_RAY_SKILL_ID, canGreenRayActivate };

export const greenRayTransfer: AbilityDefinition = {
  id: GREEN_RAY_SKILL_ID,
  name: 'character.thief_green_ray.skill_0.name',
  description: 'character.thief_green_ray.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  scopeLimit: 1,
  triggers: ['onActionPhase'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (!canGreenRayActivate(player)) return { ok: false, reason: 'condition_not_met' };
    if (ctx.turnPhase !== 'action') return { ok: false, reason: 'wrong_phase' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [
      { name: 'targetLayer', kind: 'layer', prompt: 'character.thief_green_ray.skill_0.layer' },
      { name: 'shootCardId', kind: 'card', prompt: 'character.thief_green_ray.skill_0.shootCard' },
      { name: 'shootTargetId', kind: 'player', prompt: 'character.thief_green_ray.skill_0.target' },
    ];
  },

  apply(state) {
    // R3 仅注册；真实效果链（弃 2 + 移动 + SHOOT）在 R4 落地
    return { state, events: [] };
  },
};
