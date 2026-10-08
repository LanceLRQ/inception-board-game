// 出牌 move 与牌的对应关系：玩家从手里打出一张牌时，传入的牌必须就是该 move 对应的牌，
// 否则就能拿任意手牌冒充（例如用 SHOOT 当 KICK 打出）。
// 技能内部复用结算函数的路径（哈雷·冲击、格林射线·缉捕、意念判官·定罪等）不经过这里。
// 对照：docs/manual/04-action-cards.md 各行动牌

import type { CardID } from '@icgame/shared';

/**
 * move 名 → 允许的牌 id。
 * 梦境穿梭剂 / SHOOT·梦境穿梭剂 各走各的 move（后者视为 SHOOT 类，经 playShootDreamTransit 结算）。
 * 对照：docs/manual/06-dream-master.md 梦境穿梭剂视为 SHOOT 类
 */
export const PLAY_MOVE_CARD_IDS: Readonly<Record<string, readonly string[]>> = {
  playShoot: ['action_shoot'],
  playShootKing: ['action_shoot_assassin'],
  playShootArmor: ['action_shoot_drill'],
  playShootBurst: ['action_shoot_burst'],
  playShootDreamTransit: ['action_shoot_dream_transit'],
  playUnlock: ['action_unlock'],
  playKick: ['action_kick'],
  playDreamTransit: ['action_dream_transit'],
  playTelekinesis: ['action_telekinesis'],
  playGravity: ['action_gravity'],
  playCreation: ['action_creation'],
  playGraft: ['action_graft'],
  playResonance: ['action_resonance'],
  playShift: ['action_shift'],
  playPeek: ['action_dream_peek'],
  playPeekMaster: ['action_dream_peek'],
  playTimeStorm: ['action_time_storm'],
  playNightmareUnlock: ['action_nightmare_unlock'],
};

/** 这张牌是不是该出牌 move 对应的牌；表里没有的 move 一律视为不是 */
export function isCardForPlayMove(move: string, cardId: CardID): boolean {
  return PLAY_MOVE_CARD_IDS[move]?.includes(cardId) ?? false;
}

/**
 * 一次出牌 move 的实参里，被打出的那张牌：取第一个属于该 move 对应牌的字符串实参。
 * 出牌记录与「针对出牌的应答窗口」（土星·律令）共用，保证两处认定的是同一张牌；表里没有的 move 返回 undefined。
 */
export function playedCardOf(
  move: string,
  args: readonly unknown[],
  table: Readonly<Record<string, readonly string[]>> = PLAY_MOVE_CARD_IDS,
): CardID | undefined {
  const allowed = table[move];
  if (!allowed) return undefined;
  return args.find((arg): arg is CardID => typeof arg === 'string' && allowed.includes(arg));
}
