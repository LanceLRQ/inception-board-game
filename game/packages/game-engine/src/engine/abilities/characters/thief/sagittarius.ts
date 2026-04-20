// 射手 · 心锁（thief_sagittarius.skill_1）
// 对照：docs/manual/05-dream-thieves.md 射手
// 击杀 1 玩家后改 1 心锁 ±1，限 1 次/局
//
// abilities registry 接入：onKilled trigger + perGame 限 1 次
// 注：skill_0（SHOOT 目标移动时不让移动）依赖 SHOOT 响应窗口，留待更深的 R4 批次

import { applySagittariusHeartLock, SAGITTARIUS_HEART_LOCK_SKILL_ID } from '../../../skills.js';
import { canUse, incrementUsage } from '../../usage-counter.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { SAGITTARIUS_HEART_LOCK_SKILL_ID, applySagittariusHeartLock };

export const sagittariusHeartLock: AbilityDefinition = {
  id: SAGITTARIUS_HEART_LOCK_SKILL_ID,
  name: 'character.thief_sagittarius.skill_1.name',
  description: 'character.thief_sagittarius.skill_1.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perGame',
  scopeLimit: 1,
  triggers: ['onKilled'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_sagittarius') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    const ok = canUse(
      state,
      { playerID: ctx.invokerID, abilityID: this.id, scope: 'perGame' },
      this.scopeLimit,
      ctx.turnPhase,
    );
    if (!ok) return { ok: false, reason: 'usage_exhausted' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [
      { name: 'layer', kind: 'layer', prompt: 'character.thief_sagittarius.skill_1.layer' },
      { name: 'delta', kind: 'choice', prompt: 'character.thief_sagittarius.skill_1.delta' },
    ];
  },

  apply(state: SetupState, ctx: AbilityContext, inputs) {
    const layer = Number(inputs.layer ?? 0);
    const delta = (Number(inputs.delta ?? 0) > 0 ? 1 : -1) as -1 | 1;
    const layerInfo = state.layers[layer];
    if (!layerInfo) return { state, events: [] };
    // cap 采用游戏常量 6（单层心锁上限）
    const cap = 6;
    const next = applySagittariusHeartLock(state, layer, delta, cap);
    if (!next) return { state, events: [] };
    const counted = incrementUsage(
      next,
      { playerID: ctx.invokerID, abilityID: this.id, scope: 'perGame' },
      ctx.turnPhase,
    );
    return {
      state: counted,
      events: [
        {
          type: 'sagittarius_heart_lock_resolved',
          playerID: ctx.invokerID,
          timestamp: 0,
          data: { layer, delta },
        },
      ],
    };
  },
};
