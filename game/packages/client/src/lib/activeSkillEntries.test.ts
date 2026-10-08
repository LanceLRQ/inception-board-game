// 技能面板的项：该显示的都显示，此刻用不了的带原因；可选目标 / 层 / 手牌按引擎条件筛选

import { describe, expect, it } from 'vitest';
import {
  APOLLO_WORSHIP,
  ATHENA_AWE,
  BLACK_HOLE_ABSORB,
  CHEMIST_INJECT,
  CHEMIST_REFINE,
  CHESS_TRANSPOSE,
  DARWIN_EVOLUTION,
  GEMINI_CHOICE,
  GEMINI_SYNC,
  HALEY_IMPACT,
  IMPERIAL_WORLD_SHOOT,
  MARS_BATTLEFIELD_EXCHANGE,
  MASTER_ACTIVATE_NIGHTMARE,
  PAPRIK_SALVATION,
  SATURN_FREE_MOVE,
  SECRET_PASSAGE_TELEPORT,
  SPACE_QUEEN_STASH,
  URANUS_POWER,
  VENUS_DOUBLE,
  getAvailableActiveSkills,
  getSkillEntries,
  isMasterSeat,
  layerChoicesFor,
  pickableHandIndexes,
  skillUsage,
  targetIdsFor,
  type ActiveSkillContext,
  type SkillLayerInfo,
  type SkillPlayerInfo,
} from './activeSkills';

const info = (over: Partial<SkillPlayerInfo> = {}): SkillPlayerInfo => ({
  isAlive: true,
  currentLayer: 2,
  bribeReceived: 0,
  handCount: 3,
  ...over,
});

const layer = (over: Partial<SkillLayerInfo> = {}): SkillLayerInfo => ({
  heartLockValue: 3,
  nightmareRevealed: false,
  nightmareTriggered: false,
  nightmareId: null,
  playersInLayer: [],
  ...over,
});

function ctx(over: Partial<ActiveSkillContext> = {}): ActiveSkillContext {
  return {
    characterId: 'thief_aries',
    turnPhase: 'action',
    isHumanTurn: true,
    isAlive: true,
    humanLayer: 2,
    masterLayer: 3,
    hasPending: false,
    skillUsedThisTurn: {},
    hand: [],
    faction: 'thief',
    seat: 'me',
    isDreamMaster: false,
    dreamMasterID: 'dm',
    players: { me: info(), a: info(), b: info({ currentLayer: 1 }), dm: info({ currentLayer: 3 }) },
    ...over,
  };
}

const entryFor = (c: ActiveSkillContext, skill: { id: string }) =>
  getSkillEntries(c).find((e) => e.skill.id === skill.id);

describe('技能项：次数用完后置灰并说明', () => {
  it('回合限 N 次：用完前可用，用完后仍显示但不可用，原因带已用 / 上限', () => {
    const base = {
      characterId: 'thief_chemist',
      hand: ['action_kick'],
      discardPile: ['action_dream_transit'],
    };
    expect(entryFor(ctx(base), CHEMIST_REFINE)).toMatchObject({ enabled: true, remaining: 2 });
    expect(
      entryFor(ctx({ ...base, skillUsedThisTurn: { 'thief_chemist.skill_0': 1 } }), CHEMIST_REFINE),
    ).toMatchObject({ enabled: true, remaining: 1 });
    const used = entryFor(
      ctx({ ...base, skillUsedThisTurn: { 'thief_chemist.skill_0': 2 } }),
      CHEMIST_REFINE,
    )!;
    expect(used.enabled).toBe(false);
    expect(used.reason).toEqual({ key: 'skill.reason.usedUp', params: { used: 2, limit: 2 } });
    // 用完的技能不出现在「能发动」的列表里
    expect(
      getAvailableActiveSkills(ctx({ ...base, skillUsedThisTurn: { 'thief_chemist.skill_0': 2 } })),
    ).not.toContain(CHEMIST_REFINE);
  });

  it('整局限次的技能读整局记录（棋局·易位每局 2 次）', () => {
    const base = {
      characterId: 'dm_chess',
      faction: 'master' as const,
      isDreamMaster: true,
      unopenedVaults: 4,
    };
    expect(entryFor(ctx(base), CHESS_TRANSPOSE)?.enabled).toBe(true);
    const used = entryFor(
      ctx({ ...base, skillUsedThisGame: { 'dm_chess.skill_0': 2 } }),
      CHESS_TRANSPOSE,
    )!;
    expect(used.enabled).toBe(false);
    expect(used.reason?.key).toBe('skill.reason.usedUpGame');
    // 回合记录里写了也不算
    expect(
      entryFor(ctx({ ...base, skillUsedThisTurn: { 'dm_chess.skill_0': 2 } }), CHESS_TRANSPOSE)
        ?.enabled,
    ).toBe(true);
  });

  it('次数上限随局面变化：哈雷每成功解封一次可用一次', () => {
    const base = { characterId: 'thief_haley' };
    expect(entryFor(ctx({ ...base, successfulUnlocksThisTurn: 0 }), HALEY_IMPACT)).toBeUndefined();
    expect(entryFor(ctx({ ...base, successfulUnlocksThisTurn: 2 }), HALEY_IMPACT)).toMatchObject({
      enabled: true,
      remaining: 2,
    });
    expect(
      entryFor(
        ctx({
          ...base,
          successfulUnlocksThisTurn: 2,
          skillUsedThisTurn: { 'thief_haley.skill_0': 2 },
        }),
        HALEY_IMPACT,
      )?.enabled,
    ).toBe(false);
  });

  it('天王星·权力：未派发的贿赂牌数就是上限，一张都不剩时一次也不能发动', () => {
    const base = {
      characterId: 'dm_uranus_firmament',
      faction: 'master' as const,
      isDreamMaster: true,
    };
    const none = entryFor(ctx({ ...base, bribePoolItems: [] }), URANUS_POWER)!;
    expect(none.enabled).toBe(false);
    const two = ctx({
      ...base,
      bribePoolItems: [
        { index: 0, id: 'x' },
        { index: 1, id: 'y' },
      ],
    });
    expect(skillUsage(URANUS_POWER, two)).toEqual({ used: 0, limit: 2 });
    expect(entryFor(two, URANUS_POWER)?.enabled).toBe(true);
  });

  it('没有次数概念的技能 remaining 为 null', () => {
    expect(
      entryFor(ctx({ characterId: 'thief_architect', hand: ['action_shoot'] }), {
        id: 'thief_architect.skill_0',
      })?.remaining,
    ).toBeNull();
  });
});

describe('技能项：其他引擎必拒的情形置灰并说明', () => {
  it('没有可选目标：整个技能置灰', () => {
    const e = entryFor(
      ctx({ characterId: 'thief_apollo', players: { me: info(), a: info() } }),
      APOLLO_WORSHIP,
    )!;
    expect(e).toMatchObject({ enabled: false, reason: { key: 'skill.reason.noTarget' } });
  });

  it('阿波罗·崇拜的目标：存活、收过贿赂牌、手里有牌，不含梦主与本人', () => {
    const c = ctx({
      characterId: 'thief_apollo',
      players: {
        me: info({ bribeReceived: 1 }),
        a: info({ bribeReceived: 1 }),
        b: info({ bribeReceived: 1, handCount: 0 }),
        c: info({ bribeReceived: 1, isAlive: false }),
        d: info(),
        dm: info({ bribeReceived: 1 }),
      },
    });
    expect(targetIdsFor(APOLLO_WORSHIP, c, [], [])).toEqual(['a']);
  });

  it('梦主专属技能按座位判断：背叛者阵营是 master 但座位不是梦主，看不到', () => {
    const betrayer = ctx({
      characterId: 'dm_secret_passage',
      faction: 'master',
      isDreamMaster: false,
      hand: ['action_dream_transit'],
    });
    expect(isMasterSeat(betrayer)).toBe(false);
    expect(entryFor(betrayer, SECRET_PASSAGE_TELEPORT)).toBeUndefined();
    // 上下文没给座位信息时按阵营推
    expect(isMasterSeat({ ...betrayer, isDreamMaster: undefined })).toBe(true);
  });

  it('密道·传送：键与引擎一致，牌只能选梦境穿梭剂', () => {
    const c = ctx({
      characterId: 'dm_secret_passage',
      faction: 'master',
      isDreamMaster: true,
      hand: ['action_kick', 'action_dream_transit', 'action_dream_transit'],
    });
    expect(SECRET_PASSAGE_TELEPORT.usage?.key).toBe('dm_secret_passage.skill_0');
    expect(pickableHandIndexes(SECRET_PASSAGE_TELEPORT, c)).toEqual([1, 2]);
  });

  it('土星·领地：梦主必须是土星；梦主座位本人与不持贿赂的人没有；层是相邻层', () => {
    const base = { hasBribe: true, humanLayer: 1, masterCharacterId: 'dm_saturn_territory' };
    expect(entryFor(ctx(base), SATURN_FREE_MOVE)?.enabled).toBe(true);
    expect(layerChoicesFor(SATURN_FREE_MOVE, ctx(base))).toEqual([2]);
    expect(layerChoicesFor(SATURN_FREE_MOVE, ctx({ ...base, humanLayer: 4 }))).toEqual([3]);
    expect(layerChoicesFor(SATURN_FREE_MOVE, ctx({ ...base, humanLayer: 2 }))).toEqual([1, 3]);
    expect(
      entryFor(ctx({ ...base, masterCharacterId: 'dm_chess' }), SATURN_FREE_MOVE),
    ).toBeUndefined();
    expect(entryFor(ctx({ ...base, hasBribe: false }), SATURN_FREE_MOVE)).toBeUndefined();
    expect(
      entryFor(ctx({ ...base, isDreamMaster: true, faction: 'master' }), SATURN_FREE_MOVE),
    ).toBeUndefined();
    // 背叛者：阵营是 master，但座位不是梦主，对外仍是盗梦者，引擎接受
    expect(entryFor(ctx({ ...base, faction: 'master' }), SATURN_FREE_MOVE)?.enabled).toBe(true);
    // 用过一次（回合限 1 次）
    expect(
      entryFor(
        ctx({ ...base, skillUsedThisTurn: { 'dm_saturn_territory.worldview': 1 } }),
        SATURN_FREE_MOVE,
      )?.enabled,
    ).toBe(false);
  });

  it('皇城·世界观：机会数就是剩余次数；目标不含收到过贿赂牌的人与梦主', () => {
    const c = ctx({
      masterCharacterId: 'dm_imperial_city',
      imperialShootCharges: 2,
      players: {
        me: info({ bribeReceived: 1 }),
        a: info({ bribeReceived: 1 }),
        b: info(),
        c: info({ isAlive: false }),
        dm: info(),
      },
    });
    expect(entryFor(c, IMPERIAL_WORLD_SHOOT)).toMatchObject({ enabled: true, remaining: 2 });
    expect(targetIdsFor(IMPERIAL_WORLD_SHOOT, c, [], [])).toEqual(['b']);
    expect(entryFor({ ...c, imperialShootCharges: 0 }, IMPERIAL_WORLD_SHOOT)).toBeUndefined();
  });

  it('梦魇：发动不列回音萦绕，弃掉全列；已被清走的层不算', () => {
    const c = ctx({
      faction: 'master',
      isDreamMaster: true,
      characterId: 'dm_chess',
      layers: {
        1: layer({ nightmareRevealed: true, nightmareId: 'nightmare_vortex' }),
        2: layer({ nightmareRevealed: true, nightmareId: 'nightmare_echo' }),
        3: layer({ nightmareRevealed: false, nightmareId: 'nightmare_plague' }),
        4: layer({ nightmareTriggered: true }),
      },
    });
    expect(layerChoicesFor(MASTER_ACTIVATE_NIGHTMARE, c)).toEqual([1]);
    const onlyEcho = {
      ...c,
      layers: { 2: layer({ nightmareRevealed: true, nightmareId: 'nightmare_echo' }) },
    };
    expect(entryFor(onlyEcho, MASTER_ACTIVATE_NIGHTMARE)?.reason?.key).toBe(
      'skill.reason.echoNeedsParams',
    );
  });

  it('药剂师·注射：层是目标（与本人同层）所在层的相邻层', () => {
    const c = ctx({
      characterId: 'thief_chemist',
      humanLayer: 1,
      hand: ['action_dream_transit'],
      sameLayerPlayerIds: ['a'],
    });
    expect(layerChoicesFor(CHEMIST_INJECT, c, 'a')).toEqual([2]);
    expect(entryFor(c, CHEMIST_INJECT)?.enabled).toBe(true);
    expect(entryFor({ ...c, sameLayerPlayerIds: [] }, CHEMIST_INJECT)?.reason?.key).toBe(
      'skill.reason.noTarget',
    );
  });

  it('黑洞·吸纳：相邻层里要有存活玩家', () => {
    const c = ctx({
      characterId: 'thief_black_hole',
      humanLayer: 2,
      layers: { 1: layer({ playersInLayer: [] }), 3: layer({ playersInLayer: ['dm', 'z'] }) },
      players: {
        me: info(),
        dm: info({ currentLayer: 3 }),
        z: info({ isAlive: false, currentLayer: 3 }),
      },
    });
    expect(layerChoicesFor(BLACK_HOLE_ABSORB, c)).toEqual([3]);
    const empty = { ...c, layers: { 1: layer(), 3: layer({ playersInLayer: ['z'] }) } };
    expect(entryFor(empty, BLACK_HOLE_ABSORB)?.reason?.key).toBe('skill.reason.noAdjacentPlayers');
  });

  it('火星·战场：需要 2 张非 SHOOT 牌与弃牌堆里的 SHOOT 类；可选的牌按此筛', () => {
    const c = ctx({
      marsBattlefieldActive: true,
      hand: ['action_shoot', 'action_kick', 'action_unlock'],
      discardPile: ['action_kick', 'action_shoot_assassin'],
    });
    expect(entryFor(c, MARS_BATTLEFIELD_EXCHANGE)?.enabled).toBe(true);
    expect(pickableHandIndexes(MARS_BATTLEFIELD_EXCHANGE, c)).toEqual([1, 2]);
    expect(MARS_BATTLEFIELD_EXCHANGE.discardPickable?.('action_shoot_assassin')).toBe(true);
    expect(MARS_BATTLEFIELD_EXCHANGE.discardPickable?.('action_kick')).toBe(false);
    expect(
      entryFor({ ...c, hand: ['action_shoot', 'action_kick'] }, MARS_BATTLEFIELD_EXCHANGE)?.reason
        ?.key,
    ).toBe('skill.reason.needTwoNonShoot');
    expect(
      entryFor({ ...c, discardPile: ['action_kick'] }, MARS_BATTLEFIELD_EXCHANGE)?.reason?.key,
    ).toBe('skill.reason.noShootInDiscard');
  });

  it('雅典娜 / 达尔文：牌库不够时置灰；雅典娜要刚好展示 4 张', () => {
    expect(ATHENA_AWE.pickCount).toBe(4);
    const athena = ctx({ characterId: 'thief_athena', hand: ['a', 'b', 'c', 'd'], deckCount: 0 });
    expect(entryFor(athena, ATHENA_AWE)?.reason?.key).toBe('skill.reason.deckEmpty');
    const darwin = ctx({ characterId: 'thief_darwin', hand: ['a'], deckCount: 1 });
    expect(entryFor(darwin, DARWIN_EVOLUTION)?.reason?.key).toBe('skill.reason.deckShort');
  });

  it('金星·重影：每回合 1 次', () => {
    const c = ctx({
      characterId: 'dm_venus_mirror',
      faction: 'master',
      isDreamMaster: true,
      hand: ['action_kick'],
    });
    expect(entryFor(c, VENUS_DOUBLE)?.enabled).toBe(true);
    expect(
      entryFor({ ...c, skillUsedThisTurn: { 'dm_venus_mirror.skill_0': 1 } }, VENUS_DOUBLE)
        ?.enabled,
    ).toBe(false);
  });
});

describe('背面技能与弃牌阶段技能', () => {
  it('双子翻到背面：按 thief_gemini_back 匹配，出牌阶段梦主层数字更小才显示；正面的双子·命运不再出现', () => {
    const back = ctx({ characterId: 'thief_gemini_back', humanLayer: 4, masterLayer: 3 });
    expect(entryFor(back, GEMINI_CHOICE)?.enabled).toBe(true);
    expect(entryFor(back, GEMINI_SYNC)).toBeUndefined();
    expect(entryFor({ ...back, masterLayer: 4 }, GEMINI_CHOICE)).toBeUndefined();
    expect(
      entryFor({ ...back, skillUsedThisTurn: { 'thief_gemini.skill_1': 1 } }, GEMINI_CHOICE)
        ?.enabled,
    ).toBe(false);
    // 正面朝上：没有背面技能
    expect(entryFor({ ...back, characterId: 'thief_gemini' }, GEMINI_CHOICE)).toBeUndefined();
  });

  it('双子·命运（正面）：弃牌阶段；本回合解封次数已用尽时置灰', () => {
    const front = ctx({
      characterId: 'thief_gemini',
      turnPhase: 'discard',
      humanLayer: 1,
      masterLayer: 3,
    });
    expect(entryFor(front, GEMINI_SYNC)?.enabled).toBe(true);
    expect(entryFor({ ...front, unlockExhausted: true }, GEMINI_SYNC)?.reason?.key).toBe(
      'skill.reason.unlockLimit',
    );
    expect(entryFor({ ...front, turnPhase: 'action' }, GEMINI_SYNC)).toBeUndefined();
  });

  it('空间女王·造物：只在弃牌阶段显示，没有次数限制', () => {
    const c = ctx({ characterId: 'thief_space_queen', hand: ['action_kick'] });
    expect(entryFor(c, SPACE_QUEEN_STASH)).toBeUndefined();
    expect(entryFor({ ...c, turnPhase: 'discard' }, SPACE_QUEEN_STASH)).toMatchObject({
      enabled: true,
      remaining: null,
    });
  });

  it('灵魂牧师·拯救：目标是迷失层的玩家，回合限 2 次', () => {
    const c = ctx({
      characterId: 'thief_paprik',
      hand: ['action_kick'],
      lostPlayerIds: ['x'],
      skillUsedThisTurn: { 'thief_paprik.skill_0': 2 },
    });
    expect(entryFor(c, PAPRIK_SALVATION)?.enabled).toBe(false);
    expect(PAPRIK_SALVATION.targetScope).toBe('lost');
  });
});

describe('通用闸门', () => {
  it('不是本人回合 / 已死亡 / 有待结算：没有任何项', () => {
    const c = ctx({
      characterId: 'thief_chemist',
      hand: ['action_kick'],
      discardPile: ['action_dream_transit'],
    });
    expect(getSkillEntries(c).length).toBeGreaterThan(0);
    expect(getSkillEntries({ ...c, isHumanTurn: false })).toEqual([]);
    expect(getSkillEntries({ ...c, isAlive: false })).toEqual([]);
    expect(getSkillEntries({ ...c, hasPending: true })).toEqual([]);
  });
});
