// 开局随机分配角色用的候选池
//
// 池里写的是角色牌 id（与卡牌配置里的 id 一致）。池的成员由人工登记：把引擎还没实现的角色放进池，
// 对局里就会抽到一个技能不起作用的角色，所以数据里新增角色不会自动进池。
// characterPools.test.ts 把这里的两张池与「未进池」清单同卡牌配置对账：
// 配置里的每个角色要么在池里，要么在清单里写明原因，两边都没登记时测试失败。

import type { CardID } from '@icgame/shared';

/** 梦主候选池 */
export const MASTER_POOL: readonly CardID[] = [
  'dm_fortress',
  'dm_chess',
  'dm_harbor',
  'dm_midsummer',
  'dm_black_hole',
  'dm_neptune_ocean',
  'dm_jupiter_peak',
  'dm_saturn_territory',
  'dm_imperial_city',
  'dm_secret_passage',
  'dm_uranus_firmament',
  'dm_pluto_hell',
  'dm_mars_battlefield',
  // 水星·航路：世界观（多一张失败贿赂）与逆流对 SHOOT 的响应已接入
  'dm_mercury_route',
  // 金星·镜界：重影技能与镜界世界观都已实现
  'dm_venus_mirror',
];

/** 盗梦者候选池 */
export const THIEF_POOL: readonly CardID[] = [
  'thief_pointman',
  'thief_dream_interpreter',
  'thief_space_queen',
  'thief_joker',
  'thief_leo',
  'thief_tourist',
  'thief_capricornus',
  'thief_chemist',
  'thief_paprik',
  'thief_lord_of_war',
  'thief_libra',
  'thief_sudger_of_mind',
  'thief_scorpius',
  'thief_taurus',
  'thief_apollo',
  'thief_athena',
  'thief_architect',
  'thief_virgo',
  'thief_haley',
  'thief_martyr',
  'thief_soul_sculptor',
  'thief_shade',
  'thief_hlnino',
  'thief_extractor',
  'thief_forger',
  'thief_terrorist',
  'thief_black_hole',
  'thief_black_swan',
  'thief_gemini',
  'thief_pisces',
  'thief_luna',
  'thief_aries',
  'thief_gaia',
  'thief_sagittarius',
  'thief_aquarius',
  'thief_green_ray',
  'thief_darwin',
];

/**
 * 卡牌配置里有、但没进随机池的角色，每条写明原因。
 * 角色进池后要从这里删掉；数据新增角色时，要么进池要么登记到这里。
 */
export const CHARACTERS_OUTSIDE_POOL: Readonly<Record<string, string>> = {
  thief_cancer:
    '技能（气场、庇佑）已在抽牌与弃牌阶段接入并有测试，只是登记池时漏了；放进池会改变所有固定种子下的角色分配，需要单独决定',
};
