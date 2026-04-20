// 意念判官 · 定罪（thief_sudger_of_mind.skill_0）
// 对照：docs/manual/05-dream-thieves.md 意念判官
// SHOOT 时 target 改掷 2 颗骰，由 self 选 1 颗作为结果
//
// abilities registry 接入：onBeforeShoot — 修饰链 override 模式
// R1 阶段：定义 + canActivate 检查；apply 计算最终骰值留待 R3 SHOOT 修饰链整合

import { applySudgerVerdict, SUDGER_SKILL_ID } from '../../../skills.js';
import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export { SUDGER_SKILL_ID, applySudgerVerdict };

export const sudgerVerdict: AbilityDefinition = {
  id: SUDGER_SKILL_ID,
  name: 'character.thief_sudger_of_mind.skill_0.name',
  description: 'character.thief_sudger_of_mind.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'passive',
  triggers: ['onBeforeShoot'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_sudger_of_mind')
      return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    if (!ctx.pendingShoot) return { ok: false, reason: 'no_pending_shoot' };
    // 仅当 self 是 shooter 时可发动
    if (ctx.pendingShoot.shooterID !== ctx.invokerID) return { ok: false, reason: 'not_shooter' };
    return { ok: true };
  },

  getRequiredInputs() {
    return [
      { name: 'pickA', kind: 'choice', prompt: 'character.thief_sudger_of_mind.skill_0.pickA' },
      { name: 'pickB', kind: 'choice', prompt: 'character.thief_sudger_of_mind.skill_0.pickB' },
    ];
  },

  apply(state: SetupState, ctx: AbilityContext, inputs) {
    const rollA = ctx.pendingShoot?.baseRoll ?? 1;
    const rollB = (ctx.d6 ? ctx.d6() : 1) as number;
    const pick = (inputs.pick as 'A' | 'B') ?? 'A';
    const final = applySudgerVerdict(rollA, rollB, pick);
    return {
      state,
      events: [
        {
          type: 'sudger_verdict_resolved',
          playerID: ctx.invokerID,
          timestamp: 0,
          data: { rollA, rollB, pick, final },
        },
      ],
    };
  },
};
