// 客户端卡牌元数据查询
// 封装 @icgame/shared 的 getCardById + ensureRegistered
// 供 UI 把 card ID 渲染为中文名 / 图标 / 可用行动

import { getCardById, ensureRegistered } from '@icgame/shared';
import type { CardDefinition, ActionCardDefinition } from '@icgame/shared';

// 首次 import 时静态注册所有卡牌
const regErrors = ensureRegistered();
if (regErrors.length > 0) {
  // 只在 dev 打印；注册错误是构建期问题，线上被 validateAllCards CI 挡住
  console.warn('[cards] registration errors', regErrors);
}

export type CardMeta = CardDefinition;

export function getCardMeta(id: string): CardMeta | undefined {
  return getCardById(id);
}

export function getCardName(id: string): string {
  return getCardById(id)?.name ?? id;
}

/** 拿角色技能摘要（首个 skill 的 name + description） */
export function getCharacterSkillSummary(
  characterId: string,
): { name: string; skills: Array<{ name: string; description: string }> } | null {
  const card = getCardById(characterId);
  if (!card) return null;
  if (card.category !== 'thief_char' && card.category !== 'master_char') return null;
  const ch = card as import('@icgame/shared').CharacterDefinition;
  return {
    name: ch.name,
    skills: ch.front.skills.map((s) => ({ name: s.name, description: s.description })),
  };
}

export function isActionCard(id: string): boolean {
  return getCardById(id)?.category === 'action';
}

/**
 * 判断手牌能否在 action 阶段打出，返回对应的 move 名 + 目标规格 + 参数顺序
 * argOrder 默认 'target_first'：调用 [target, cardId]（如 playShoot）
 * argOrder 'card_first'：调用 [cardId, target]（如 playKick / playShift）
 * argOrder 'card_only'：调用 [cardId]（无目标 move 也用此标记）
 */
export interface ActionMoveSpec {
  move: string;
  needsTarget: 'player' | 'layer' | 'none';
  argOrder?: 'target_first' | 'card_first';
}
export function actionMoveFor(id: string): ActionMoveSpec | null {
  const card = getCardById(id);
  if (!card || card.category !== 'action') return null;
  const action = card as ActionCardDefinition;

  if (action.id === 'action_shoot') {
    return { move: 'playShoot', needsTarget: 'player', argOrder: 'target_first' };
  }
  if (action.id === 'action_unlock') return { move: 'playUnlock', needsTarget: 'none' };
  if (action.id === 'action_dream_transit') {
    return { move: 'playDreamTransit', needsTarget: 'layer', argOrder: 'card_first' };
  }
  if (action.id === 'action_creation') return { move: 'playCreation', needsTarget: 'none' };
  if (action.id === 'action_kick') {
    return { move: 'playKick', needsTarget: 'player', argOrder: 'card_first' };
  }
  if (action.id === 'action_telekinesis') {
    return { move: 'playTelekinesis', needsTarget: 'player', argOrder: 'card_first' };
  }
  if (action.id === 'action_dream_peek') {
    return { move: 'playPeek', needsTarget: 'layer', argOrder: 'card_first' };
  }
  if (action.id === 'action_time_storm') return { move: 'playTimeStorm', needsTarget: 'none' };
  if (action.id === 'action_nightmare_unlock') {
    return { move: 'playNightmareUnlock', needsTarget: 'layer', argOrder: 'card_first' };
  }
  if (action.id === 'action_shoot_king') {
    return { move: 'playShootKing', needsTarget: 'player', argOrder: 'target_first' };
  }
  if (action.id === 'action_shoot_armor') {
    return { move: 'playShootArmor', needsTarget: 'player', argOrder: 'target_first' };
  }
  if (action.id === 'action_shoot_burst') {
    return { move: 'playShootBurst', needsTarget: 'player', argOrder: 'target_first' };
  }
  // 嫁接：playGraft 不需目标；二阶段 pendingGraft 由 LocalMatchRuntime 处理
  if (action.id === 'action_graft') return { move: 'playGraft', needsTarget: 'none' };
  // 共鸣 / 移形换影：目标玩家
  if (action.id === 'action_resonance') {
    return { move: 'playResonance', needsTarget: 'player', argOrder: 'card_first' };
  }
  if (action.id === 'action_shift') {
    return { move: 'playShift', needsTarget: 'player', argOrder: 'card_first' };
  }
  // 万有引力 / 死亡宣言 仍需专属 UI
  if (action.id === 'action_gravity') return null;
  // SHOOT·梦境穿梭剂：LocalMatchRuntime 拦截进入 mode picker
  if (action.id === 'action_shoot_dream_transit') {
    return { move: 'playShootDreamTransit', needsTarget: 'none' };
  }
  if (action.id === 'action_death_decree_3') return null;
  if (action.id === 'action_death_decree_4') return null;
  if (action.id === 'action_death_decree_5') return null;
  if (action.subType?.startsWith('shoot_')) {
    return { move: 'playShoot', needsTarget: 'player', argOrder: 'target_first' };
  }
  return null;
}
