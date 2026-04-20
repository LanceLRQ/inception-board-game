// 白羊 · 弃梦魇加成（thief_aries.skill_1）
// 对照：docs/manual/05-dream-thieves.md 白羊
// 弃掉的梦魇牌每张让 self 抽牌阶段 +1
//
// abilities registry 接入：onDrawPhase passive 修饰器
// scope=passive：不限次数，作为额外抽牌数提供
//
// 注：白羊·skill_0（盗梦者被杀时翻当层梦魇）依赖 onKilled 响应窗口，留 R3 批次

import { ariesExtraDrawCount, ARIES_DRAW_SKILL_ID } from '../../../skills.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { ARIES_DRAW_SKILL_ID, ariesExtraDrawCount };

export const ariesExtraDraw: AbilityDefinition = {
  id: ARIES_DRAW_SKILL_ID,
  name: 'character.thief_aries.skill_1.name',
  description: 'character.thief_aries.skill_1.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'passive',
  triggers: ['onDrawPhase'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_aries') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    if (ariesExtraDrawCount(state) === 0) return { ok: false, reason: 'no_used_nightmare' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state: SetupState, ctx: AbilityContext) {
    const extra = ariesExtraDrawCount(state);
    return {
      state,
      events: [
        {
          type: 'aries_extra_draw_active',
          playerID: ctx.invokerID,
          timestamp: 0,
          data: { extra },
        },
      ],
    };
  },
};
