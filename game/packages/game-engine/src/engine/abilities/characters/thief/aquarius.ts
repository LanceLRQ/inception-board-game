// 水瓶 · 同流（thief_aquarius.skill_1）
// 对照：docs/manual/05-dream-thieves.md 水瓶
// 解封次数无限制（被动）— game.ts playUnlock guard 已接入，registry 主要承担文档化角色
//
// 注：水瓶另一个技能（同名重用）依赖响应窗口，留 R3 批次

import { isAquariusUnlimitedActive, AQUARIUS_UNLOCK_SKILL_ID } from '../../../skills.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { AQUARIUS_UNLOCK_SKILL_ID };

export const aquariusUnlimited: AbilityDefinition = {
  id: AQUARIUS_UNLOCK_SKILL_ID,
  name: 'character.thief_aquarius.skill_1.name',
  description: 'character.thief_aquarius.skill_1.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'passive',
  triggers: ['passive'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (!isAquariusUnlimitedActive(player)) return { ok: false, reason: 'condition_not_met' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state) {
    // 被动技能：仅作为 game.ts unlock guard 的标记位
    return { state, events: [] };
  },
};
