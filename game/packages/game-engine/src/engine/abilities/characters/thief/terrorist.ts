// 恐怖分子 · 远程（thief_terrorist.skill_0）
// 对照：docs/manual/05-dream-thieves.md 恐怖分子
// 使用的 SHOOT 类牌不受层数限制（被动，无激活条件）
//
// abilities registry 接入：passive trigger（skills.ts isTerroristCrossLayerActive 已被
// applyShootVariant 吃掉，这里只是 registry 存档）
//
// 注：skill_1（target 弃牌否则骰-1）依赖 SHOOT 响应窗口 + 新纯函数，留 R4 批次

import { isTerroristCrossLayerActive, TERRORIST_SKILL_ID } from '../../../skills.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { TERRORIST_SKILL_ID, isTerroristCrossLayerActive };

export const terroristCrossLayer: AbilityDefinition = {
  id: TERRORIST_SKILL_ID,
  name: 'character.thief_terrorist.skill_0.name',
  description: 'character.thief_terrorist.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'passive',
  triggers: ['passive', 'onBeforeShoot'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (!isTerroristCrossLayerActive(player)) return { ok: false, reason: 'condition_not_met' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state) {
    // 被动：已由 applyShootVariant 吸收，这里作为文档化标记
    return { state, events: [] };
  },
};
