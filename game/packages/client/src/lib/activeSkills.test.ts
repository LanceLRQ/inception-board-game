// activeSkills 纯函数推导测试

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import {
  FORTRESS_COLDNESS_CHANCES_KEY as ENGINE_CHANCES_KEY,
  fortressColdnessChancesLeft,
  movePlayerToLayer,
  viewFor,
} from '@icgame/game-engine';
import { createTestState, makePlayer } from '@icgame/game-engine/testing/fixtures';
import { buildActiveSkillContext } from '../components/MatchRuntime/controllerDerive.js';
import {
  APOLLO_WORSHIP,
  ARCHITECT_MAZE,
  ATHENA_AWE,
  CHEMIST_REFINE,
  FORGER_EXCHANGE,
  FORTRESS_COLDNESS,
  FORTRESS_COLDNESS_CHANCES_KEY,
  fortressColdnessRemaining,
  GAIA_SHIFT,
  GEMINI_SYNC,
  getAvailableActiveSkills,
  HALEY_IMPACT,
  LIBRA_BALANCE,
  LORD_OF_WAR_BLACK_MARKET,
  LUNA_ECLIPSE,
  MARS_BATTLEFIELD_EXCHANGE,
  MARS_KILL,
  MARTYR_SACRIFICE,
  MASTER_DISCARD_NIGHTMARE,
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

describe('getAvailableActiveSkills · 穿行者·支助（不限次数，需要至少 1 张手牌）', () => {
  it('穿行者 + 有手牌 → 含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_tourist', hand: ['action_kick'] }),
    );
    expect(list).toContain(TOURIST_ASSIST);
  });

  it('穿行者 + 本回合已用过 + 又有手牌 → 仍含', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_tourist',
        hand: ['action_kick'],
        skillUsedThisTurn: { 'thief_tourist.skill_0': 1 },
      }),
    );
    expect(list).toContain(TOURIST_ASSIST);
  });

  it('穿行者 + 没有手牌 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ characterId: 'thief_tourist' }));
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
  it('梦主 → 含 2 个通用梦魇操作（DISCARD/ACTIVATE，处理已被翻开的梦魇）', async () => {
    const mod = await import('./activeSkills.js');
    const list = getAvailableActiveSkills(
      baseCtx({ faction: 'master', characterId: 'dm_fortress' }),
    );
    expect(list).toContain(MASTER_DISCARD_NIGHTMARE);
    expect(list).toContain(mod.MASTER_ACTIVATE_NIGHTMARE);
  });

  it('盗梦者 → 不含', () => {
    const list = getAvailableActiveSkills(baseCtx({ faction: 'thief' }));
    expect(list).not.toContain(MASTER_DISCARD_NIGHTMARE);
  });

  it('已删除的 move 不再有主动技能入口', () => {
    const removed = [
      'masterRevealNightmare',
      'masterDiscardHiddenNightmare',
      'masterDealBribe',
      'masterDealBribeImperial',
    ];
    const list = getAvailableActiveSkills(
      baseCtx({
        faction: 'master',
        characterId: 'dm_imperial_city',
        bribePoolAvailable: true,
        bribePoolItems: [{ index: 0, id: 'bribe-0' }],
      }),
    );
    for (const move of removed) {
      expect(list.map((s) => s.move)).not.toContain(move);
    }
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

describe('getAvailableActiveSkills · 哈雷·冲击', () => {
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

describe('getAvailableActiveSkills · 露娜·月蚀', () => {
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

describe('getAvailableActiveSkills · 雅典娜·惊叹', () => {
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

describe('getAvailableActiveSkills · 盖亚·大地', () => {
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

describe('getAvailableActiveSkills · 战争之王·黑市', () => {
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

describe('getAvailableActiveSkills · 火星·战场世界观', () => {
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

describe('getAvailableActiveSkills · 天秤·平衡', () => {
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

describe('getAvailableActiveSkills · 欺诈师·盗心（盲抽）', () => {
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

describe('getAvailableActiveSkills · 双面角色按面出现', () => {
  it('双子背面朝上时不出现正面技能·命运', () => {
    const list = getAvailableActiveSkills(
      baseCtx({
        characterId: 'thief_gemini_back',
        turnPhase: 'discard',
        humanLayer: 1,
        masterLayer: 3,
      }),
    );
    expect(list).not.toContain(GEMINI_SYNC);
  });

  it('露娜背面朝上时不出现正面技能·月蚀', () => {
    const list = getAvailableActiveSkills(
      baseCtx({ characterId: 'thief_luna_back', hand: ['action_shoot', 'action_shoot'] }),
    );
    expect(list).not.toContain(LUNA_ECLIPSE);
  });
});

describe('getAvailableActiveSkills · 要塞·冷酷', () => {
  const master = (overrides: Partial<ActiveSkillContext> = {}) =>
    baseCtx({ characterId: 'dm_fortress', faction: 'master', ...overrides });

  it('梦主 + 本回合换过层且还没发动 → 含；按钮上的剩余次数为 1', () => {
    const ctx = master({ skillUsedThisTurn: { [FORTRESS_COLDNESS_CHANCES_KEY]: 1 } });
    expect(getAvailableActiveSkills(ctx)).toContain(FORTRESS_COLDNESS);
    expect(FORTRESS_COLDNESS.remaining?.(ctx)).toBe(1);
  });

  it('没有换过层 → 不含', () => {
    expect(getAvailableActiveSkills(master())).not.toContain(FORTRESS_COLDNESS);
  });

  it('换一次层、已发动一次 → 不含；换两次、已发动一次 → 含，剩余 1', () => {
    const spent = master({
      skillUsedThisTurn: { [FORTRESS_COLDNESS_CHANCES_KEY]: 1, 'dm_fortress.skill_0': 1 },
    });
    expect(getAvailableActiveSkills(spent)).not.toContain(FORTRESS_COLDNESS);
    const again = master({
      skillUsedThisTurn: { [FORTRESS_COLDNESS_CHANCES_KEY]: 2, 'dm_fortress.skill_0': 1 },
    });
    expect(getAvailableActiveSkills(again)).toContain(FORTRESS_COLDNESS);
    expect(FORTRESS_COLDNESS.remaining?.(again)).toBe(1);
  });

  it('不是出牌阶段、不是自己的回合、有待结算事项 → 不含', () => {
    const used = { [FORTRESS_COLDNESS_CHANCES_KEY]: 2 };
    for (const o of [
      { turnPhase: 'draw' },
      { turnPhase: 'discard' },
      { isHumanTurn: false },
      { hasPending: true },
    ] as const) {
      expect(getAvailableActiveSkills(master({ skillUsedThisTurn: used, ...o }))).not.toContain(
        FORTRESS_COLDNESS,
      );
    }
  });

  it('不是要塞梦主 → 不含（其他梦主、盗梦者即使记录里有计数）', () => {
    const used = { [FORTRESS_COLDNESS_CHANCES_KEY]: 2 };
    expect(
      getAvailableActiveSkills(master({ characterId: 'dm_chess', skillUsedThisTurn: used })),
    ).not.toContain(FORTRESS_COLDNESS);
    expect(
      getAvailableActiveSkills(
        baseCtx({ characterId: 'thief_shade', faction: 'thief', skillUsedThisTurn: used }),
      ),
    ).not.toContain(FORTRESS_COLDNESS);
  });

  it('选一名玩家后发 useFortressColdness', () => {
    expect(FORTRESS_COLDNESS.argKind).toBe('targetPlayer');
    expect(FORTRESS_COLDNESS.move).toBe('useFortressColdness');
  });

  it('与引擎对账：计数键相同，剩余次数的公式与引擎一致', () => {
    expect(FORTRESS_COLDNESS_CHANCES_KEY).toBe(ENGINE_CHANCES_KEY);
    const records: Record<string, number>[] = [
      {},
      { [ENGINE_CHANCES_KEY]: 3 },
      { [ENGINE_CHANCES_KEY]: 3, 'dm_fortress.skill_0': 2 },
      { [ENGINE_CHANCES_KEY]: 1, 'dm_fortress.skill_0': 4 },
    ];
    for (const used of records) {
      expect(fortressColdnessRemaining(used)).toBe(fortressColdnessChancesLeft(used));
    }
  });

  it('只靠梦主本人的视图判断：引擎里换层后，视图推出可发动；别人的视图看不到计数', () => {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      currentPlayerID: 'pM',
      dreamMasterID: 'pM',
      playerOrder: ['p1', 'p2', 'pM'],
    });
    const players = {
      p1: makePlayer({ id: 'p1', faction: 'thief', characterId: 'thief_shade' as CardID }),
      p2: makePlayer({ id: 'p2', faction: 'thief', characterId: 'thief_shade' as CardID }),
      pM: makePlayer({
        id: 'pM',
        faction: 'master',
        characterId: 'dm_fortress' as CardID,
        currentLayer: 1 as Layer,
      }),
    };
    const moved = movePlayerToLayer({ ...base, players }, 'pM', 2);

    const own = viewFor(moved, 'pM', { gameOver: false });
    const ctx = buildActiveSkillContext({ G: own, seat: 'pM', isMyTurn: true, hand: [] });
    expect(getAvailableActiveSkills(ctx)).toContain(FORTRESS_COLDNESS);

    const before = viewFor({ ...base, players }, 'pM', { gameOver: false });
    const idle = buildActiveSkillContext({ G: before, seat: 'pM', isMyTurn: true, hand: [] });
    expect(getAvailableActiveSkills(idle)).not.toContain(FORTRESS_COLDNESS);

    expect(viewFor(moved, 'p1', { gameOver: false }).players.pM!.skillUsedThisTurn).toBeNull();
  });
});
