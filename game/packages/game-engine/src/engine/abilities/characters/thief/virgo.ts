// 处女 · 完美（thief_virgo.skill_0）
// 对照：docs/manual/05-dream-thieves.md 处女
// 任意玩家骰 6 时，处女可三选一：复活弃牌堆己方角色 / 抽 2 张 / 传送到任一层
//
// W20.5 实装：
//   - scope='passive' + triggers=['onAfterShoot']：每次 SHOOT 结算后由 dispatchPassives 自动检查
//   - canActivate 校验：处女存活 + lastShootRoll === 6 + 当前无 pending（避免重入）
//   - apply 不直接施加副作用，而是挂起 pendingVirgoChoice 等待玩家选择
//   - 三选一副作用由 game.ts 的 respondVirgoPerfect move 调用 skills.ts 的 helper 执行

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
  scope: 'passive',
  triggers: ['onAfterShoot'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.characterId !== 'thief_virgo') return { ok: false, reason: 'wrong_character' };
    if (!player.isAlive) return { ok: false, reason: 'dead' };
    // 已挂起则不重入（同一次 SHOOT 多次进入 dispatchPassives 时跳过）
    if (state.pendingVirgoChoice) return { ok: false, reason: 'already_pending' };
    // 触发条件：本回合最近一次 SHOOT 骰值 = 6
    const roll = state.lastShootRoll;
    if (roll === null || roll === undefined || !isVirgoPerfectTriggered(roll)) {
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

  apply(state: SetupState, ctx: AbilityContext) {
    // 防御性二次校验
    const roll = state.lastShootRoll;
    if (roll === null || roll === undefined || !isVirgoPerfectTriggered(roll)) {
      return { state, events: [] };
    }
    if (state.pendingVirgoChoice) {
      return { state, events: [] };
    }
    const next: SetupState = {
      ...state,
      pendingVirgoChoice: {
        virgoID: ctx.invokerID,
        triggerRoll: roll,
        // shooterID 由 dispatchPassives 上下文给不出来；用 currentPlayerID 作 best-effort 记录
        shooterID: state.currentPlayerID,
      },
    };
    return {
      state: next,
      events: [
        {
          type: 'virgo_perfect_pending',
          playerID: ctx.invokerID,
          timestamp: 0,
        },
      ],
    };
  },
};
