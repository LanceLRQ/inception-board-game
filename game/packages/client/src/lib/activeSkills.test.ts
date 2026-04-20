// R7 · activeSkills 纯函数推导测试

import { describe, expect, it } from 'vitest';
import {
  APOLLO_WORSHIP,
  getAvailableActiveSkills,
  SHADE_FOLLOW,
  type ActiveSkillContext,
} from './activeSkills.js';

function baseCtx(overrides: Partial<ActiveSkillContext> = {}): ActiveSkillContext {
  return {
    characterId: 'thief_shade',
    turnPhase: 'action',
    isHumanTurn: true,
    isAlive: true,
    humanLayer: 1,
    masterLayer: 2,
    hasPending: false,
    skillUsedThisTurn: {},
    ...overrides,
  };
}

describe('getAvailableActiveSkills · 通用闸门', () => {
  it('非人类回合 → 空', () => {
    expect(getAvailableActiveSkills(baseCtx({ isHumanTurn: false }))).toEqual([]);
  });

  it('非行动阶段 → 空', () => {
    expect(getAvailableActiveSkills(baseCtx({ turnPhase: 'draw' }))).toEqual([]);
  });

  it('死亡 → 空', () => {
    expect(getAvailableActiveSkills(baseCtx({ isAlive: false }))).toEqual([]);
  });

  it('有 pending 状态 → 空（避免覆盖解结算）', () => {
    expect(getAvailableActiveSkills(baseCtx({ hasPending: true }))).toEqual([]);
  });
});

describe('getAvailableActiveSkills · 影子·潜伏', () => {
  it('影子 + 不同层 + 梦主非迷失 → 含 SHADE_FOLLOW', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_shade' }));
    expect(list).toContain(SHADE_FOLLOW);
  });

  it('已同层 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_shade', humanLayer: 2, masterLayer: 2 }),
    );
    expect(list).not.toContain(SHADE_FOLLOW);
  });

  it('梦主在迷失层（0）→ 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_shade', masterLayer: 0 }));
    expect(list).not.toContain(SHADE_FOLLOW);
  });

  it('非影子角色 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_apollo' }));
    expect(list).not.toContain(SHADE_FOLLOW);
  });
});

describe('getAvailableActiveSkills · 阿波罗·崇拜', () => {
  it('阿波罗 → 含 APOLLO_WORSHIP', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_apollo' }));
    expect(list).toContain(APOLLO_WORSHIP);
  });

  it('非阿波罗 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_shade' }));
    expect(list).not.toContain(APOLLO_WORSHIP);
  });
});

describe('描述符元数据', () => {
  it('SHADE_FOLLOW move=playShadeFollow，argKind=none', () => {
    expect(SHADE_FOLLOW.move).toBe('playShadeFollow');
    expect(SHADE_FOLLOW.argKind).toBe('none');
  });

  it('APOLLO_WORSHIP move=playApolloWorship，argKind=targetPlayer', () => {
    expect(APOLLO_WORSHIP.move).toBe('playApolloWorship');
    expect(APOLLO_WORSHIP.argKind).toBe('targetPlayer');
  });
});
