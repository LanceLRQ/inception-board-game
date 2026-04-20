// 水星·航路（dm_mercury_route）
// 对照：docs/manual/06-dream-master.md 水星·航路
// 技能「逆流」：另一拥有贿赂的盗梦者使用牌时，若你与他同层则你先将该牌收入手牌，然后结算该牌效果。回合限 2 次
// 世界观：当梦主角色牌翻开时，额外增加 1 张失败的贿赂牌。
//
// 当前状态：registry 存档占位；完整实施依赖"牌使用追踪 + 响应窗口"子系统（预留 Phase 3 后续批次）

import type { AbilityContext, AbilityDefinition } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

export const MERCURY_REVERSE_SKILL_ID = 'dm_mercury_route.skill_0';
export const MERCURY_WORLD_VIEW_ID = 'dm_mercury_route.world_view';

/** 水星·逆流：技能 stub（待响应窗口/出牌追踪就绪） */
export const mercuryReverse: AbilityDefinition = {
  id: MERCURY_REVERSE_SKILL_ID,
  name: 'character.dm_mercury_route.skill_0.name',
  description: 'character.dm_mercury_route.skill_0.desc',
  kind: 'skill',
  priorityBucket: 1,
  scope: 'perTurn',
  scopeLimit: 2,
  triggers: ['onActionPhase'],

  canActivate(state: SetupState, ctx: AbilityContext) {
    const player = state.players[ctx.invokerID];
    if (!player) return { ok: false, reason: 'invalid_player' };
    if (player.faction !== 'master') return { ok: false, reason: 'not_master' };
    // 完整条件（同层 + 贿赂持有者用牌）依赖响应窗口，此处仅 stub
    return { ok: false, reason: 'not_implemented' };
  },

  getRequiredInputs() {
    return [];
  },

  apply(state) {
    return { state, events: [] };
  },
};

/** 水星·航路世界观：stub（梦主翻面时增加失败贿赂） */
export const mercuryRouteWorldView: AbilityDefinition = {
  id: MERCURY_WORLD_VIEW_ID,
  name: 'character.dm_mercury_route.world_view.name',
  description: 'character.dm_mercury_route.world_view.desc',
  kind: 'worldView',
  priorityBucket: 3,
  triggers: ['passive'],

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
