// 金星·镜界（dm_venus_mirror）
// 对照：docs/manual/06-dream-master.md 金星·镜界
// 技能「重影」：你的回合出牌前，可展示牌库顶等于非死亡盗梦者数的牌，
//   然后展示任意手牌并将所有展示的同名牌收入手牌，其余混洗放回牌库顶。回合限 1 次
// 世界观：玩家可以弃掉 2 张牌，重复执行本回合内之前任意 1 张牌的非抽牌及弃牌效果，每回合仅可一次。
//
// 当前状态：registry 存档占位；完整实施依赖 pending state（展示→挑同名）+ 回合内出牌追踪

import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export const VENUS_DOUBLE_SKILL_ID = 'dm_venus_mirror.skill_0';
export const VENUS_WORLD_VIEW_ID = 'dm_venus_mirror.world_view';

/** 金星·重影：技能 stub（待 pending state/展示窗口） */
export const venusDouble: AbilityDefinition = {
  id: VENUS_DOUBLE_SKILL_ID,
  name: 'character.dm_venus_mirror.skill_0.name',
  description: 'character.dm_venus_mirror.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  scopeLimit: 1,
  triggers: ['onActionPhase'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.faction !== 'master') return { ok: false, reason: 'not_master' };
    return { ok: false, reason: 'not_implemented' };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state) {
    return { state, events: [] };
  },
};

/** 金星·镜界世界观：stub（弃 2 张重复非抽弃效果） */
export const venusMirrorWorldView: AbilityDefinition = {
  id: VENUS_WORLD_VIEW_ID,
  name: 'character.dm_venus_mirror.world_view.name',
  description: 'character.dm_venus_mirror.world_view.desc',
  kind: 'worldView',
  priorityBucket: 3,
  triggers: ['onActionPhase'],

  canActivate() {
    return { ok: false, reason: 'not_implemented' };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state) {
    return { state, events: [] };
  },
};
