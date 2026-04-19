// 能力注册表 + 静态检查
// 校验角色 ID 唯一性、触发时机合法性、技能 ID 唯一性

import type { CardDefinition, CharacterDefinition, SkillDefinition } from '../types/cards.js';
import {
  THIEF_CHARACTERS,
  MASTER_CHARACTERS,
  ACTION_CARDS,
  NIGHTMARE_CARDS,
  DREAM_CARDS,
  VAULT_CARDS,
  BRIBE_CARDS,
} from './generated/cards.js';

const VALID_TRIGGERS = new Set<string>([
  'onTurnStart',
  'onDrawPhase',
  'onActionPhase',
  'onDiscardPhase',
  'onTurnEnd',
  'onBeforeShoot',
  'onAfterShoot',
  'onUnlock',
  'onUnlockCanceled',
  'onBribe',
  'onBribeCanceled',
  'onDeath',
  'onRevive',
  'onLayerChange',
  'onCardPlayed',
  'onPhaseEnd',
  'onGameEnd',
  'always',
]);

export interface ValidationError {
  kind: 'duplicate_card_id' | 'duplicate_skill_id' | 'invalid_trigger' | 'missing_required_field';
  cardId: string;
  detail: string;
}

// 注册表：所有卡牌按 ID 索引
const cardMap = new Map<string, CardDefinition>();
const skillMap = new Map<string, SkillDefinition>();

function registerCards(cards: readonly CardDefinition[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const card of cards) {
    if (cardMap.has(card.id)) {
      errors.push({
        kind: 'duplicate_card_id',
        cardId: card.id,
        detail: `重复的卡牌 ID: ${card.id}`,
      });
    }
    cardMap.set(card.id, card);

    // 校验角色技能
    if (card.category === 'thief_char' || card.category === 'master_char') {
      const char = card as CharacterDefinition;
      const skillErrors = validateCharacterSkills(char);
      errors.push(...skillErrors);
    }
  }

  return errors;
}

function validateCharacterSkills(char: CharacterDefinition): ValidationError[] {
  const errors: ValidationError[] = [];

  const sides = [char.front, char.back].filter(Boolean) as { skills: SkillDefinition[] }[];
  for (const side of sides) {
    for (const skill of side.skills) {
      if (skillMap.has(skill.id)) {
        errors.push({
          kind: 'duplicate_skill_id',
          cardId: char.id,
          detail: `重复的技能 ID: ${skill.id}`,
        });
      }
      skillMap.set(skill.id, skill);

      if (!VALID_TRIGGERS.has(skill.trigger)) {
        errors.push({
          kind: 'invalid_trigger',
          cardId: char.id,
          detail: `技能 ${skill.id} 的触发时机不合法: ${skill.trigger}`,
        });
      }
    }
  }

  return errors;
}

// 执行注册 + 校验
export function validateAllCards(): ValidationError[] {
  const allErrors: ValidationError[] = [];
  allErrors.push(...registerCards(THIEF_CHARACTERS));
  allErrors.push(...registerCards(MASTER_CHARACTERS));
  allErrors.push(...registerCards(ACTION_CARDS));
  allErrors.push(...registerCards(NIGHTMARE_CARDS));
  allErrors.push(...registerCards(DREAM_CARDS));
  allErrors.push(...registerCards(VAULT_CARDS));
  allErrors.push(...registerCards(BRIBE_CARDS));
  return allErrors;
}

// 查询 API
export function getCardById(id: string): CardDefinition | undefined {
  return cardMap.get(id);
}

export function getSkillById(id: string): SkillDefinition | undefined {
  return skillMap.get(id);
}

export function getAllCharacters(): readonly CharacterDefinition[] {
  return [...THIEF_CHARACTERS, ...MASTER_CHARACTERS];
}

export function getCardsByCategory<T extends CardDefinition>(category: string): readonly T[] {
  const result: T[] = [];
  for (const card of cardMap.values()) {
    if (card.category === category) result.push(card as T);
  }
  return result;
}

// 运行时自检（开发环境）
let validated = false;
export function ensureRegistered(): ValidationError[] {
  if (validated) return [];
  validated = true;
  return validateAllCards();
}
