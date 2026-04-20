// R7 · activeSkills 纯函数推导测试

import { describe, expect, it } from 'vitest';
import {
  APOLLO_WORSHIP,
  ARCHITECT_MAZE,
  CHEMIST_REFINE,
  GEMINI_SYNC,
  getAvailableActiveSkills,
  MARS_KILL,
  MARTYR_SACRIFICE,
  MASTER_DISCARD_NIGHTMARE,
  MASTER_REVEAL_NIGHTMARE,
  PLUTO_BURNING,
  SATURN_FREE_MOVE,
  SHADE_FOLLOW,
  TOURIST_ASSIST,
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
    hand: [],
    faction: 'thief',
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

  it('TOURIST_ASSIST move=playTouristAssist，argKind=targetPlayer', () => {
    expect(TOURIST_ASSIST.move).toBe('playTouristAssist');
    expect(TOURIST_ASSIST.argKind).toBe('targetPlayer');
  });

  it('MARTYR_SACRIFICE move=playMartyrSacrifice，argKind=choiceIncDec', () => {
    expect(MARTYR_SACRIFICE.move).toBe('playMartyrSacrifice');
    expect(MARTYR_SACRIFICE.argKind).toBe('choiceIncDec');
  });
});

describe('getAvailableActiveSkills · 穿行者·支助（回合限 1）', () => {
  it('穿行者 + 未用过 → 含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_tourist' }));
    expect(list).toContain(TOURIST_ASSIST);
  });

  it('穿行者 + 已用过 1 次 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_tourist',
        skillUsedThisTurn: { 'thief_tourist.skill_0': 1 },
      }),
    );
    expect(list).not.toContain(TOURIST_ASSIST);
  });
});

describe('getAvailableActiveSkills · 殉道者·牺牲', () => {
  it('殉道者 → 含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_martyr' }));
    expect(list).toContain(MARTYR_SACRIFICE);
  });

  it('非殉道者 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_apollo' }));
    expect(list).not.toContain(MARTYR_SACRIFICE);
  });
});

describe('getAvailableActiveSkills · 药剂师·调剂（handCard）', () => {
  it('药剂师 + 有手牌 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_chemist', hand: ['action_unlock'] }),
    );
    expect(list).toContain(CHEMIST_REFINE);
  });

  it('药剂师 + 手牌空 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_chemist', hand: [] }));
    expect(list).not.toContain(CHEMIST_REFINE);
  });

  it('argKind = handCard', () => {
    expect(CHEMIST_REFINE.argKind).toBe('handCard');
  });
});

describe('getAvailableActiveSkills · 筑梦师·迷宫（cardAndPlayer）', () => {
  it('筑梦师 + 有手牌 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_architect', hand: ['action_unlock'] }),
    );
    expect(list).toContain(ARCHITECT_MAZE);
  });

  it('筑梦师 + 手牌空 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_architect', hand: [] }));
    expect(list).not.toContain(ARCHITECT_MAZE);
  });

  it('argKind = cardAndPlayer', () => {
    expect(ARCHITECT_MAZE.argKind).toBe('cardAndPlayer');
  });
});

describe('getAvailableActiveSkills · 火星·杀戮（梦主·targetLayer）', () => {
  it('梦主 + 火星·战场 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'dm_mars_battlefield', faction: 'master' }),
    );
    expect(list).toContain(MARS_KILL);
  });

  it('非梦主 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'dm_mars_battlefield', faction: 'thief' }),
    );
    expect(list).not.toContain(MARS_KILL);
  });

  it('argKind = targetLayer', () => {
    expect(MARS_KILL.argKind).toBe('targetLayer');
  });

  it('SATURN_FREE_MOVE argKind + move 正确', () => {
    expect(SATURN_FREE_MOVE.argKind).toBe('targetLayer');
    expect(SATURN_FREE_MOVE.move).toBe('useSaturnFreeMove');
  });
});

describe('getAvailableActiveSkills · 土星·自由移动（贿赂持有者）', () => {
  it('盗梦者 + 持贿赂 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ faction: 'thief', hasBribe: true, characterId: 'thief_any' }),
    );
    expect(list).toContain(SATURN_FREE_MOVE);
  });

  it('盗梦者 + 无贿赂 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ faction: 'thief', hasBribe: false, characterId: 'thief_any' }),
    );
    expect(list).not.toContain(SATURN_FREE_MOVE);
  });

  it('梦主 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ faction: 'master', hasBribe: true, characterId: 'dm_x' }),
    );
    expect(list).not.toContain(SATURN_FREE_MOVE);
  });
});

describe('getAvailableActiveSkills · 梦主梦魇操作（通用）', () => {
  it('梦主 → 含 4 个通用梦魇操作（REVEAL/DISCARD/HIDDEN/ACTIVATE）', async () => {
    const mod = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(
      baseCtx({ faction: 'master', characterId: 'dm_fortress' }),
    );
    expect(list).toContain(MASTER_REVEAL_NIGHTMARE);
    expect(list).toContain(MASTER_DISCARD_NIGHTMARE);
    expect(list).toContain(mod.MASTER_DISCARD_HIDDEN_NIGHTMARE);
    expect(list).toContain(mod.MASTER_ACTIVATE_NIGHTMARE);
  });

  it('盗梦者 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ faction: 'thief' }));
    expect(list).not.toContain(MASTER_REVEAL_NIGHTMARE);
    expect(list).not.toContain(MASTER_DISCARD_NIGHTMARE);
  });

  it('MASTER_REVEAL move = masterRevealNightmare / argKind = targetLayer', () => {
    expect(MASTER_REVEAL_NIGHTMARE.move).toBe('masterRevealNightmare');
    expect(MASTER_REVEAL_NIGHTMARE.argKind).toBe('targetLayer');
  });
});

describe('getAvailableActiveSkills · 密道·传送（playerAndCard）', () => {
  it('梦主 + 手牌 + 未用满 → 含', async () => {
    const { SECRET_PASSAGE_TELEPORT } = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(
      baseCtx({ faction: 'master', characterId: 'dm_x', hand: ['action_unlock'] }),
    );
    expect(list).toContain(SECRET_PASSAGE_TELEPORT);
  });

  it('已用 2 次 → 不含（回合限 2）', async () => {
    const { SECRET_PASSAGE_TELEPORT } = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(
      baseCtx({
        faction: 'master',
        characterId: 'dm_x',
        hand: ['action_unlock'],
        skillUsedThisTurn: { secret_passage_teleport: 2 },
      }),
    );
    expect(list).not.toContain(SECRET_PASSAGE_TELEPORT);
  });

  it('盗梦者 → 不含', async () => {
    const { SECRET_PASSAGE_TELEPORT } = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(
      baseCtx({ faction: 'thief', characterId: 'thief_any', hand: ['action_unlock'] }),
    );
    expect(list).not.toContain(SECRET_PASSAGE_TELEPORT);
  });

  it('argKind = playerAndCard', async () => {
    const { SECRET_PASSAGE_TELEPORT } = await import('./activeSkills.js');
    expect(SECRET_PASSAGE_TELEPORT.argKind).toBe('playerAndCard');
  });
});

describe('getAvailableActiveSkills · 灵魂牧师·拯救 & 天王星·权力', () => {
  it('灵魂牧师 + 手牌 → 含 PAPRIK', async () => {
    const { PAPRIK_SALVATION } = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_paprik', hand: ['action_unlock'] }),
    );
    expect(list).toContain(PAPRIK_SALVATION);
  });

  it('灵魂牧师 + 手牌空 → 不含', async () => {
    const { PAPRIK_SALVATION } = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_paprik', hand: [] }));
    expect(list).not.toContain(PAPRIK_SALVATION);
  });

  it('天王星·权力（梦主）→ 含 URANUS_POWER · argKind=playerAndLayer', async () => {
    const { URANUS_POWER } = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'dm_uranus_firmament', faction: 'master' }),
    );
    expect(list).toContain(URANUS_POWER);
    expect(URANUS_POWER.argKind).toBe('playerAndLayer');
  });

  it('非梦主 → 不含 URANUS_POWER', async () => {
    const { URANUS_POWER } = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'dm_uranus_firmament', faction: 'thief' }),
    );
    expect(list).not.toContain(URANUS_POWER);
  });
});

describe('getAvailableActiveSkills · 冥王星·业火（梦主技能）', () => {
  it('梦主 + 冥王星 + 有手牌 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'dm_pluto_hell',
        faction: 'master',
        hand: ['action_unlock'],
      }),
    );
    expect(list).toContain(PLUTO_BURNING);
  });

  it('非梦主身份 → 不含（faction=thief 守卫）', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'dm_pluto_hell', faction: 'thief', hand: ['action_unlock'] }),
    );
    expect(list).not.toContain(PLUTO_BURNING);
  });

  it('梦主 + 手牌空 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'dm_pluto_hell', faction: 'master', hand: [] }),
    );
    expect(list).not.toContain(PLUTO_BURNING);
  });
});

describe('getAvailableActiveSkills · 双子·协同（弃牌阶段）', () => {
  it('双子 + 弃牌阶段 + 梦主层>己层 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_gemini',
        turnPhase: 'discard',
        humanLayer: 1,
        masterLayer: 3,
      }),
    );
    expect(list).toContain(GEMINI_SYNC);
  });

  it('双子 + 弃牌阶段 + 梦主层=己层 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_gemini',
        turnPhase: 'discard',
        humanLayer: 2,
        masterLayer: 2,
      }),
    );
    expect(list).not.toContain(GEMINI_SYNC);
  });

  it('双子 + 行动阶段 → 不含（requiredPhase=discard）', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_gemini', turnPhase: 'action', masterLayer: 3 }),
    );
    expect(list).not.toContain(GEMINI_SYNC);
  });

  it('requiredPhase = discard', () => {
    expect(GEMINI_SYNC.requiredPhase).toBe('discard');
  });
});
