// W10-R4 · 桶 E 水星/金星 未实装占位 stub
// 对照：plans/tasks.md Phase 3 abilities registry · R4（水星·航路/金星·镜界 世界观 stub）

import { describe, expect, it } from 'vitest';
import { scenarioStartOfGame3p } from '../../../../testing/scenarios.js';
import {
  ALL_MASTER_ABILITIES,
  createDefaultRegistry,
  mercuryReverse,
  mercuryRouteWorldView,
  venusDouble,
  venusMirrorWorldView,
} from '../index.js';
import type { AbilityContext } from '../../types.js';
import type { SetupState } from '../../../../setup.js';

function ctxFor(state: SetupState, invokerID: string): AbilityContext {
  return {
    invokerID,
    turnNumber: state.turnNumber,
    turnPhase: state.turnPhase,
    dreamMasterID: state.dreamMasterID,
    invokerFaction: state.players[invokerID]?.faction ?? 'thief',
    d6: () => 4,
  };
}

describe('R4 · master 注册集', () => {
  it('ALL_MASTER_ABILITIES 含 4 个 stub', () => {
    expect(ALL_MASTER_ABILITIES).toHaveLength(4);
    const ids = ALL_MASTER_ABILITIES.map((a) => a.id).sort();
    expect(ids).toEqual([
      'dm_mercury_route.skill_0',
      'dm_mercury_route.world_view',
      'dm_venus_mirror.skill_0',
      'dm_venus_mirror.world_view',
    ]);
  });

  it('registry 能按角色检索：dm_mercury_route → 2 个', () => {
    const reg = createDefaultRegistry();
    const list = reg.getByCharacter('dm_mercury_route');
    expect(list).toHaveLength(2);
  });

  it('registry 能按角色检索：dm_venus_mirror → 2 个', () => {
    const reg = createDefaultRegistry();
    const list = reg.getByCharacter('dm_venus_mirror');
    expect(list).toHaveLength(2);
  });

  it('worldView kind 被正确标记', () => {
    expect(mercuryRouteWorldView.kind).toBe('worldView');
    expect(venusMirrorWorldView.kind).toBe('worldView');
    expect(mercuryReverse.kind).toBe('skill');
    expect(venusDouble.kind).toBe('skill');
  });

  it('worldView 优先级桶 = 3', () => {
    expect(mercuryRouteWorldView.priorityBucket).toBe(3);
    expect(venusMirrorWorldView.priorityBucket).toBe(3);
  });
});

describe('R4 · 水星·航路 stub', () => {
  it('canActivate 返回 not_implemented（非梦主）', () => {
    const s = scenarioStartOfGame3p();
    const ctx = ctxFor(s, 'p1');
    expect(mercuryReverse.canActivate(s, ctx).reason).toBe('not_master');
  });

  it('canActivate 返回 not_implemented（梦主）', () => {
    const s = scenarioStartOfGame3p();
    const ctx = ctxFor(s, 'pM');
    expect(mercuryReverse.canActivate(s, ctx).reason).toBe('not_implemented');
  });

  it('apply：state 不变（stub）', () => {
    const s = scenarioStartOfGame3p();
    const ctx = ctxFor(s, 'pM');
    expect(mercuryReverse.apply(s, ctx, {}).state).toBe(s);
  });

  it('世界观 stub：canActivate = not_implemented', () => {
    const s = scenarioStartOfGame3p();
    const ctx = ctxFor(s, 'pM');
    expect(mercuryRouteWorldView.canActivate(s, ctx).reason).toBe('not_implemented');
  });
});

describe('R4 · 金星·镜界 stub', () => {
  it('canActivate 返回 not_implemented（梦主）', () => {
    const s = scenarioStartOfGame3p();
    const ctx = ctxFor(s, 'pM');
    expect(venusDouble.canActivate(s, ctx).reason).toBe('not_implemented');
  });

  it('世界观 kind=worldView + trigger=onActionPhase', () => {
    expect(venusMirrorWorldView.kind).toBe('worldView');
    expect(venusMirrorWorldView.triggers).toContain('onActionPhase');
  });

  it('apply：state 不变（stub）', () => {
    const s = scenarioStartOfGame3p();
    const ctx = ctxFor(s, 'pM');
    expect(venusDouble.apply(s, ctx, {}).state).toBe(s);
  });
});

describe('R4 · 总览', () => {
  it('registry 总注册数 = 14 盗梦者 + 4 梦主 = 18', () => {
    const reg = createDefaultRegistry();
    const allTrigger: string[] = [
      'onTurnStart',
      'onDrawPhase',
      'onActionPhase',
      'onDiscardPhase',
      'onTurnEnd',
      'onBeforeShoot',
      'onAfterShoot',
      'onUnlock',
      'onKilled',
      'onReceiveBribe',
      'onVaultOpen',
      'passive',
    ];
    const uniqueIds = new Set<string>();
    for (const t of allTrigger) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of reg.getByTrigger(t as any)) uniqueIds.add(a.id);
    }
    expect(uniqueIds.size).toBeGreaterThanOrEqual(18);
  });
});
