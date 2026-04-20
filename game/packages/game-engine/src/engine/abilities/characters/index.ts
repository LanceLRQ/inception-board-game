// 角色能力 bootstrap — 把所有 AbilityDefinition 注册到一个 InMemoryAbilityRegistry
// 对照：plans/design/05-card-system.md §5.1.2
//
// 使用方式（典型）：
//   import { createDefaultRegistry } from './characters';
//   const registry = createDefaultRegistry();
//   registry.getByCharacter('thief_virgo'); // → [virgoPerfect]

import { InMemoryAbilityRegistry } from '../registry.js';
import type { AbilityDefinition } from '../types.js';

import { virgoPerfect } from './thief/virgo.js';
import { athenaWit } from './thief/athena-wit.js';
import { aquariusUnlimited } from './thief/aquarius.js';
import { sudgerVerdict } from './thief/sudger.js';
import { piscesEvade } from './thief/pisces.js';
import { jokerGamble } from './thief/joker.js';
import { blackSwanTour } from './thief/black-swan.js';
import { ariesExtraDraw } from './thief/aries.js';
import { blackHoleLevy } from './thief/black-hole.js';
import { spaceQueenObserve, spaceQueenStashTop } from './thief/space-queen.js';
import { sagittariusHeartLock } from './thief/sagittarius.js';
import { terroristCrossLayer } from './thief/terrorist.js';
import { greenRayTransfer } from './thief/green-ray.js';

import { mercuryReverse, mercuryRouteWorldView } from './master/mercury-route.js';
import { venusDouble, venusMirrorWorldView } from './master/venus-mirror.js';

export const ALL_THIEF_ABILITIES: readonly AbilityDefinition[] = [
  virgoPerfect,
  athenaWit,
  aquariusUnlimited,
  sudgerVerdict,
  piscesEvade,
  jokerGamble,
  blackSwanTour,
  ariesExtraDraw,
  blackHoleLevy,
  spaceQueenObserve,
  spaceQueenStashTop,
  sagittariusHeartLock,
  terroristCrossLayer,
  greenRayTransfer,
];

export const ALL_MASTER_ABILITIES: readonly AbilityDefinition[] = [
  mercuryReverse,
  mercuryRouteWorldView,
  venusDouble,
  venusMirrorWorldView,
];

/** 创建一个填好默认能力的 registry */
export function createDefaultRegistry(): InMemoryAbilityRegistry {
  const reg = new InMemoryAbilityRegistry();
  for (const a of ALL_THIEF_ABILITIES) reg.register(a);
  for (const a of ALL_MASTER_ABILITIES) reg.register(a);
  return reg;
}

export {
  virgoPerfect,
  athenaWit,
  aquariusUnlimited,
  sudgerVerdict,
  piscesEvade,
  jokerGamble,
  blackSwanTour,
  ariesExtraDraw,
  blackHoleLevy,
  spaceQueenObserve,
  spaceQueenStashTop,
  sagittariusHeartLock,
  terroristCrossLayer,
  greenRayTransfer,
  mercuryReverse,
  mercuryRouteWorldView,
  venusDouble,
  venusMirrorWorldView,
};
