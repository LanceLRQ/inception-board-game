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

/** 判断手牌能否在 action 阶段打出，返回对应的 move 名 + 目标规格 */
export function actionMoveFor(
  id: string,
): { move: string; needsTarget: 'player' | 'layer' | 'none' } | null {
  const card = getCardById(id);
  if (!card || card.category !== 'action') return null;
  const action = card as ActionCardDefinition;

  // 按 ID 或 subType 分类（MVP 只覆盖 engine 已实现的 4 个 move）
  if (action.id === 'action_shoot') {
    return { move: 'playShoot', needsTarget: 'player' };
  }
  if (action.id === 'action_unlock') {
    return { move: 'playUnlock', needsTarget: 'none' };
  }
  if (action.id === 'action_dream_transit') {
    return { move: 'playDreamTransit', needsTarget: 'layer' };
  }
  if (action.id === 'action_creation') {
    return { move: 'playCreation', needsTarget: 'none' };
  }
  if (action.id === 'action_kick') {
    return { move: 'playKick', needsTarget: 'player' };
  }
  if (action.id === 'action_telekinesis') {
    return { move: 'playTelekinesis', needsTarget: 'player' };
  }
  if (action.id === 'action_dream_peek') {
    return { move: 'playPeek', needsTarget: 'layer' };
  }
  if (action.id === 'action_time_storm') {
    return { move: 'playTimeStorm', needsTarget: 'none' };
  }
  if (action.id === 'action_nightmare_unlock') {
    return { move: 'playNightmareUnlock', needsTarget: 'layer' };
  }
  if (action.id === 'action_shoot_king') {
    return { move: 'playShootKing', needsTarget: 'player' };
  }
  if (action.id === 'action_shoot_armor') {
    return { move: 'playShootArmor', needsTarget: 'player' };
  }
  if (action.id === 'action_shoot_burst') {
    return { move: 'playShootBurst', needsTarget: 'player' };
  }
  // 嫁接 / 共鸣 / 万有引力 / 移形换影 / SHOOT·梦境穿梭剂 / 死亡宣言 需特殊 UI 交互
  // 当前 LocalMatchRuntime 尚未接入，从手牌暂不可点选；Bot 可正常触发
  if (action.id === 'action_graft') return null;
  if (action.id === 'action_resonance') return null;
  if (action.id === 'action_gravity') return null;
  if (action.id === 'action_shift') return null;
  if (action.id === 'action_shoot_dream_transit') return null;
  if (action.id === 'action_death_decree_3') return null;
  if (action.id === 'action_death_decree_4') return null;
  if (action.id === 'action_death_decree_5') return null;
  // 其他 SHOOT 变种 fallback 走通用 playShoot
  if (action.subType?.startsWith('shoot_')) {
    return { move: 'playShoot', needsTarget: 'player' };
  }
  return null;
}
