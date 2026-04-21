// R7 · activeSkills 纯函数推导测试

import { describe, expect, it } from 'vitest';
import {
  APOLLO_WORSHIP,
  ARCHITECT_MAZE,
  ATHENA_AWE,
  CHEMIST_REFINE,
  FORGER_EXCHANGE,
  GAIA_SHIFT,
  GEMINI_SYNC,
  getAvailableActiveSkills,
  HALEY_IMPACT,
  IMPERIAL_DEAL_BRIBE,
  LIBRA_BALANCE,
  LORD_OF_WAR_BLACK_MARKET,
  LUNA_ECLIPSE,
  MARS_BATTLEFIELD_EXCHANGE,
  MARS_KILL,
  MARTYR_SACRIFICE,
  MASTER_DEAL_BRIBE,
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

describe('getAvailableActiveSkills · 达尔文·进化（multiCard）', () => {
  it('达尔文 + 手牌 → 含', async () => {
    const { DARWIN_EVOLUTION } = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_darwin', hand: ['action_unlock'] }),
    );
    expect(list).toContain(DARWIN_EVOLUTION);
  });

  it('达尔文 + 手牌空 → 不含', async () => {
    const { DARWIN_EVOLUTION } = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_darwin', hand: [] }));
    expect(list).not.toContain(DARWIN_EVOLUTION);
  });

  it('argKind = multiCard', async () => {
    const { DARWIN_EVOLUTION } = await import('./activeSkills.js');
    expect(DARWIN_EVOLUTION.argKind).toBe('multiCard');
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

describe('getAvailableActiveSkills · R16 哈雷·冲击', () => {
  it('哈雷 + 本回合成功解封 1 次 + 未触发 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_haley',
        successfulUnlocksThisTurn: 1,
        skillUsedThisTurn: {},
      }),
    );
    expect(list).toContain(HALEY_IMPACT);
  });

  it('哈雷 + 解封 0 次 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_haley', successfulUnlocksThisTurn: 0 }),
    );
    expect(list).not.toContain(HALEY_IMPACT);
  });

  it('哈雷 + 解封 2 次 + 已触发 2 次 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_haley',
        successfulUnlocksThisTurn: 2,
        skillUsedThisTurn: { 'thief_haley.skill_0': 2 },
      }),
    );
    expect(list).not.toContain(HALEY_IMPACT);
  });

  it('哈雷 + 解封 2 次 + 已触发 1 次 → 含（还能再触发 1 次）', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_haley',
        successfulUnlocksThisTurn: 2,
        skillUsedThisTurn: { 'thief_haley.skill_0': 1 },
      }),
    );
    expect(list).toContain(HALEY_IMPACT);
  });

  it('非哈雷角色 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_apollo', successfulUnlocksThisTurn: 5 }),
    );
    expect(list).not.toContain(HALEY_IMPACT);
  });

  it('argKind = targetPlayer', () => {
    expect(HALEY_IMPACT.argKind).toBe('targetPlayer');
  });
});

describe('getAvailableActiveSkills · 梦主·贿赂派发（已从常驻主动技能移除）', () => {
  // 规则：贿赂派发不能由梦主主动发起，只能在盗梦者【梦境窥视】/打开金币金库时触发。
  // 因此 MASTER_DEAL_BRIBE 已从 ALL_DESCRIPTORS 注册表移除，但常量定义保留供响应窗口复用。
  // 对照：docs/manual/03-game-flow.md §贿赂&背叛者
  it('梦主 + 池中有可派发项 → 不再出现在主动技能列表', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'dm_fortress',
        faction: 'master',
        bribePoolAvailable: true,
      }),
    );
    expect(list).not.toContain(MASTER_DEAL_BRIBE);
  });

  it('常量定义仍保留（供后续响应窗口复用）', () => {
    expect(MASTER_DEAL_BRIBE.argKind).toBe('targetPlayer');
    expect(MASTER_DEAL_BRIBE.move).toBe('masterDealBribe');
  });
});

describe('getAvailableActiveSkills · R17 露娜·月蚀', () => {
  it('露娜 + 手牌 ≥2 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_luna', hand: ['action_shoot', 'action_shoot'] }),
    );
    expect(list).toContain(LUNA_ECLIPSE);
  });

  it('露娜 + 手牌 1 张 → 不含（基础手牌数闸门）', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_luna', hand: ['action_shoot'] }),
    );
    expect(list).not.toContain(LUNA_ECLIPSE);
  });

  it('非露娜角色 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_apollo', hand: ['action_shoot', 'action_shoot'] }),
    );
    expect(list).not.toContain(LUNA_ECLIPSE);
  });

  it('argKind = multiCardAndPlayer', () => {
    expect(LUNA_ECLIPSE.argKind).toBe('multiCardAndPlayer');
  });
});

describe('getAvailableActiveSkills · R17 雅典娜·惊叹', () => {
  it('雅典娜 + 手牌 ≥4 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_athena', hand: ['a', 'b', 'c', 'd'] }),
    );
    expect(list).toContain(ATHENA_AWE);
  });

  it('雅典娜 + 手牌 3 张 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_athena', hand: ['a', 'b', 'c'] }),
    );
    expect(list).not.toContain(ATHENA_AWE);
  });

  it('非雅典娜角色 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_apollo', hand: ['a', 'b', 'c', 'd', 'e'] }),
    );
    expect(list).not.toContain(ATHENA_AWE);
  });

  it('argKind = multiCardAndPlayer', () => {
    expect(ATHENA_AWE.argKind).toBe('multiCardAndPlayer');
  });
});

describe('getAvailableActiveSkills · R18 盖亚·大地', () => {
  it('盖亚 + 同层有其他玩家 + 未用完 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_gaia',
        sameLayerPlayerIds: ['1', '2'],
        skillUsedThisTurn: {},
      }),
    );
    expect(list).toContain(GAIA_SHIFT);
  });

  it('盖亚 + 同层无其他玩家 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_gaia', sameLayerPlayerIds: [] }),
    );
    expect(list).not.toContain(GAIA_SHIFT);
  });

  it('盖亚 + 已用 2 次 → 不含（回合限 2）', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_gaia',
        sameLayerPlayerIds: ['1'],
        skillUsedThisTurn: { 'thief_gaia.skill_0': 2 },
      }),
    );
    expect(list).not.toContain(GAIA_SHIFT);
  });

  it('盖亚 + 已用 1 次 → 含（还能再触发 1 次）', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_gaia',
        sameLayerPlayerIds: ['1'],
        skillUsedThisTurn: { 'thief_gaia.skill_0': 1 },
      }),
    );
    expect(list).toContain(GAIA_SHIFT);
  });

  it('非盖亚角色 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_shade', sameLayerPlayerIds: ['1'] }),
    );
    expect(list).not.toContain(GAIA_SHIFT);
  });

  it('argKind = layerShiftPicks', () => {
    expect(GAIA_SHIFT.argKind).toBe('layerShiftPicks');
  });
});

describe('getAvailableActiveSkills · R19 战争之王·黑市', () => {
  it('战争之王 + 手牌≥2 + 弃牌堆非空 + 未用 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_lord_of_war',
        hand: ['a', 'b'],
        discardPile: ['c'],
      }),
    );
    expect(list).toContain(LORD_OF_WAR_BLACK_MARKET);
  });

  it('战争之王 + 手牌 1 张 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_lord_of_war',
        hand: ['a'],
        discardPile: ['c'],
      }),
    );
    expect(list).not.toContain(LORD_OF_WAR_BLACK_MARKET);
  });

  it('战争之王 + 弃牌堆空 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_lord_of_war',
        hand: ['a', 'b'],
        discardPile: [],
      }),
    );
    expect(list).not.toContain(LORD_OF_WAR_BLACK_MARKET);
  });

  it('战争之王 + 已用 1 次 → 不含（回合限 1）', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_lord_of_war',
        hand: ['a', 'b'],
        discardPile: ['c'],
        skillUsedThisTurn: { 'thief_lord_of_war.skill_0': 1 },
      }),
    );
    expect(list).not.toContain(LORD_OF_WAR_BLACK_MARKET);
  });

  it('非战争之王角色 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_shade',
        hand: ['a', 'b'],
        discardPile: ['c'],
      }),
    );
    expect(list).not.toContain(LORD_OF_WAR_BLACK_MARKET);
  });

  it('argKind = multiCardAndDiscardCard', () => {
    expect(LORD_OF_WAR_BLACK_MARKET.argKind).toBe('multiCardAndDiscardCard');
  });
});

describe('getAvailableActiveSkills · 皇城·重金（已从常驻主动技能移除）', () => {
  // 规则：重金是"派贿赂时可指定 1 张牌"的修饰能力（替代随机抽），
  // 本质仍属于派贿赂响应流程，不能由梦主主动发起。
  // 本次修复移除其常驻主动面板；响应窗口的"指定派发"交互留待后续迭代。
  // 对照：docs/manual/06-dream-master.md 皇城·重金
  it('皇城梦主 + 贿赂池有项 → 不再出现在主动技能列表', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'dm_imperial_city',
        faction: 'master',
        bribePoolItems: [{ index: 0, id: 'bribe-deal-0' }],
      }),
    );
    expect(list).not.toContain(IMPERIAL_DEAL_BRIBE);
  });

  it('常量定义仍保留（供后续响应窗口复用）', () => {
    expect(IMPERIAL_DEAL_BRIBE.argKind).toBe('playerAndBribeIndex');
    expect(IMPERIAL_DEAL_BRIBE.move).toBe('masterDealBribeImperial');
  });
});

describe('getAvailableActiveSkills · R21 火星·战场世界观', () => {
  it('世界观激活 + 手牌≥2 + 弃牌堆非空 → 含（任意阵营）', () => {
    const list1 = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_shade',
        faction: 'thief',
        hand: ['a', 'b'],
        discardPile: ['action_shoot'],
        marsBattlefieldActive: true,
      }),
    );
    const list2 = getAvailableActiveSkills(
      baseCtx({
        characterId: 'dm_mars_battlefield',
        faction: 'master',
        hand: ['a', 'b'],
        discardPile: ['action_shoot'],
        marsBattlefieldActive: true,
      }),
    );
    expect(list1).toContain(MARS_BATTLEFIELD_EXCHANGE);
    expect(list2).toContain(MARS_BATTLEFIELD_EXCHANGE);
  });

  it('世界观未激活 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_shade',
        hand: ['a', 'b'],
        discardPile: ['action_shoot'],
        marsBattlefieldActive: false,
      }),
    );
    expect(list).not.toContain(MARS_BATTLEFIELD_EXCHANGE);
  });

  it('世界观激活 + 手牌 1 张 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_shade',
        hand: ['a'],
        discardPile: ['action_shoot'],
        marsBattlefieldActive: true,
      }),
    );
    expect(list).not.toContain(MARS_BATTLEFIELD_EXCHANGE);
  });

  it('世界观激活 + 弃牌堆空 → 不含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_shade',
        hand: ['a', 'b'],
        discardPile: [],
        marsBattlefieldActive: true,
      }),
    );
    expect(list).not.toContain(MARS_BATTLEFIELD_EXCHANGE);
  });

  it('argKind = twoCardsAndShoot', () => {
    expect(MARS_BATTLEFIELD_EXCHANGE.argKind).toBe('twoCardsAndShoot');
  });
});

describe('getAvailableActiveSkills · R23 天秤·平衡', () => {
  it('天秤 + 手牌>0 + 未用 → 含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_libra', hand: ['a'] }));
    expect(list).toContain(LIBRA_BALANCE);
  });

  it('天秤 + 手牌空 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_libra', hand: [] }));
    expect(list).not.toContain(LIBRA_BALANCE);
  });

  it('天秤 + 已用 1 次 → 不含（回合限 1）', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_libra',
        hand: ['a'],
        skillUsedThisTurn: { 'thief_libra.skill_0': 1 },
      }),
    );
    expect(list).not.toContain(LIBRA_BALANCE);
  });

  it('非天秤角色 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_shade', hand: ['a'] }));
    expect(list).not.toContain(LIBRA_BALANCE);
  });

  it('argKind = targetPlayer', () => {
    expect(LIBRA_BALANCE.argKind).toBe('targetPlayer');
  });
});

describe('getAvailableActiveSkills · R24 欺诈师·盗心（盲抽）', () => {
  it('欺诈师 + 手牌>0 + 未用 → 含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_forger', hand: ['a'] }));
    expect(list).toContain(FORGER_EXCHANGE);
  });

  it('欺诈师 + 手牌空 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_forger', hand: [] }));
    expect(list).not.toContain(FORGER_EXCHANGE);
  });

  it('欺诈师 + 已用 1 次 → 不含（回合限 1）', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_forger',
        hand: ['a'],
        skillUsedThisTurn: { 'thief_forger.skill_0': 1 },
      }),
    );
    expect(list).not.toContain(FORGER_EXCHANGE);
  });

  it('非欺诈师角色 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_shade', hand: ['a'] }));
    expect(list).not.toContain(FORGER_EXCHANGE);
  });

  it('argKind = playerAndCard', () => {
    expect(FORGER_EXCHANGE.argKind).toBe('playerAndCard');
  });
});
