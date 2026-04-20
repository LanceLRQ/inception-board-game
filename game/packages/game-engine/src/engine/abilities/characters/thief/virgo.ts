// 处女 · 完美（thief_virgo.skill_0）
// 对照：docs/manual/05-dream-thieves.md 处女
// 任意玩家骰 6 时，处女可三选一：复活弃牌堆己方角色 / 抽 2 张 / 传送到任一层
//
// abilities registry 接入：onAfterShoot trigger（每个 SHOOT 之后由 dispatcher 调用 canActivate）
// R1 阶段：仅注册定义；UI 选项呈现/apply 实装留 R3 响应窗口集成

import { isVirgoPerfectTriggered } from '../../../skills.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export const VIRGO_PERFECT_ID = 'thief_virgo.skill_0';

export const virgoPerfect: AbilityDefinition = {
  id: VIRGO_PERFECT_ID,
  name: 'character.thief_virgo.skill_0.name',
  description: 'character.thief_virgo.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  triggers: ['onAfterShoot'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_virgo') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    const roll = ctx.pendingShoot?.baseRoll;
    if (roll === undefined || !isVirgoPerfectTriggered(roll)) {
      return { ok: false, reason: 'condition_not_met' };
    }
    return { ok: true };
  },

  getRequiredInputs() {
    return [
      {
        name: 'choice',
        kind: 'choice',
        prompt: 'character.thief_virgo.skill_0.choice',
      },
    ];
  },

  apply(state) {
    // R1 阶段不实施副作用；R3 整合 dispatcher + 响应窗口后落地
    return { state, events: [] };
  },
};
