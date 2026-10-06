// 射手 · 心锁（thief_sagittarius.skill_1）
// 对照：docs/manual/05-dream-thieves.md 射手
// 本回合击杀过玩家时，改 1 个心锁 ±1，回合限 1 次（与 useSagittariusHeartLock 共用 canUseSagittariusHeartLock）
//
// abilities registry 接入：onKilled trigger + perTurn 限 1 次
// 注：skill_0（SHOOT 目标移动时不让移动）依赖 SHOOT 响应窗口，留待更深的后续批次

import {
  applySagittariusHeartLock,
  canUseSagittariusHeartLock,
  SAGITTARIUS_HEART_LOCK_SKILL_ID,
} from '../../../skills.js';
import { incrementUsage } from '../../usage-counter.js';
import { SAGITTARIUS_KILLS_THIS_TURN_KEY } from '../../../death.js';
import { PLAYER_COUNT_CONFIGS } from '../../../../config.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { SAGITTARIUS_HEART_LOCK_SKILL_ID, applySagittariusHeartLock };

export const sagittariusHeartLock: AbilityDefinition = {
  id: SAGITTARIUS_HEART_LOCK_SKILL_ID,
  name: 'character.thief_sagittarius.skill_1.name',
  description: 'character.thief_sagittarius.skill_1.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  scopeLimit: 1,
  triggers: ['onKilled'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_sagittarius') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    if (!canUseSagittariusHeartLock(state, ctx.invokerID)) {
      const killed = (player.skillUsedThisTurn[SAGITTARIUS_KILLS_THIS_TURN_KEY] ?? 0) > 0;
      return { ok: false, reason: killed ? 'usage_exhausted' : 'no_kill_this_turn' };
    }
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
    // 心锁数不能超过原有数量：该层的初始心锁数
    const cap = PLAYER_COUNT_CONFIGS[state.playerOrder.length]?.heartLocks[layer - 1] ?? 3;
    const next = applySagittariusHeartLock(state, ctx.invokerID, layer, delta, cap);
    if (!next) return { state, events: [] };
    const counted = incrementUsage(
      next,
      { playerID: ctx.invokerID, abilityID: this.id, scope: 'perTurn' },
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
