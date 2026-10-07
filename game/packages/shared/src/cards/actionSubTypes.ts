// 行动牌的分类表（手工维护）
//
// 卡牌数据文件里没有「分类」这一项，所以由这张表逐张给出。
// 生成脚本按卡牌 id 查表：数据里出现表里没有的行动牌、或表里有数据里没有的 id，都会直接报错；
// actionSubTypes.test.ts 另外核对表与入库的生成结果一一对应。
//
// 消费方：client 的 actionMoveFor 对没有专属分支的牌，按 shoot_ 前缀归入 SHOOT 类出牌。

import type { ActionSubType } from '../types/enums.js';

export const ACTION_SUB_TYPES: Readonly<Record<string, ActionSubType>> = {
  action_shoot: 'shoot_basic',
  action_kick: 'kick',
  action_unlock: 'unlock',
  action_graft: 'graft',
  action_dream_transit: 'dream_serum',
  action_resonance: 'resonance',
  action_time_storm: 'time_storm',
  action_creation: 'fabrication',
  action_telekinesis: 'pull',
  action_nightmare_unlock: 'nightmare_unlock',
  action_shift: 'shapeshift',
  action_dream_peek: 'dream_peek',
  action_gravity: 'gravity',
  action_shoot_burst: 'shoot_special',
  action_shoot_assassin: 'shoot_special',
  action_shoot_drill: 'shoot_special',
  action_shoot_dream_transit: 'shoot_hybrid',
  action_death_decree_3: 'death_declaration',
  action_death_decree_4: 'death_declaration',
  action_death_decree_5: 'death_declaration',
};
