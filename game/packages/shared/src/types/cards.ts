// 盗梦都市 - 卡牌类型定义
// 对照：plans/design/03-data-model.md §3.3

import type { CardID, ActionSubType, Faction, SkillUsageScope, TriggerTiming } from './enums.js';

// === 目标规则 ===

export interface TargetSpec {
  kind: 'none' | 'self' | 'otherPlayer' | 'layer' | 'card' | 'deck';
  layerScope?: 'same' | 'adjacent' | 'any';
  factionScope?: 'any' | 'thief' | 'master';
  excludeLost?: boolean;
  count?: number | 'any' | [number, number];
  extra?: {
    allowSelf?: boolean;
    conditions?: string[];
  };
}

// === 效果描述 ===

export type EffectDescriptor =
  | { kind: 'rollDice'; sides: 6; count: 1 | 2; modifier?: string }
  | { kind: 'move'; subject: 'self' | 'target'; to: 'adjacent' | 'specific' }
  | { kind: 'discardFromHand'; count: number | 'all'; filter?: string }
  | { kind: 'drawFromDeck'; count: number | 'diceResult' }
  | { kind: 'kill'; target: 'target'; when: string }
  | { kind: 'exchangeLayer' }
  | { kind: 'exchangeHands'; maxCount?: number }
  | { kind: 'peekVault' }
  | { kind: 'peekBribes'; targetFaction: 'thief' }
  | { kind: 'cancelCard'; targetCardID: CardID }
  | { kind: 'discardDeckTop'; count: number }
  | { kind: 'placeToDeckTop'; count: number }
  | { kind: 'revealHand'; subject: 'target' }
  | { kind: 'grantBribe'; master: 'optional' | 'forced' }
  | { kind: 'removeFromGame'; subject: 'self' };

// === 行动牌定义 ===

export interface ActionCardDefinition {
  readonly category: 'action';
  readonly id: CardID;
  readonly name: string;
  readonly subType: ActionSubType;
  readonly quantity: number;
  readonly isExpansion: boolean;
  readonly isRemovedAfterUse: boolean;
  readonly timing: Array<'actionPhase' | 'anyPhase'>;
  readonly targetSpec: TargetSpec;
  readonly effects: EffectDescriptor[];
  readonly imagePath: string;
}

// === 角色定义 ===

export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly trigger: TriggerTiming;
  readonly usageScope: SkillUsageScope;
  readonly limitN?: number;
  readonly isActive: boolean;
  readonly cost?: SkillCost;
  readonly preconditions?: string[];
  readonly priority?: number;
}

export interface SkillCost {
  readonly discardCard?: number;
  readonly moveToLayer?: number;
}

export interface CharacterSideDefinition {
  readonly sideName: string;
  readonly skills: SkillDefinition[];
}

export interface CharacterDefinition {
  readonly category: 'thief_char' | 'master_char';
  readonly id: CardID;
  readonly name: string;
  readonly faction: Faction;
  readonly doubleSided: boolean;
  readonly front: CharacterSideDefinition;
  readonly back?: CharacterSideDefinition;
  readonly imagePath: string;
  /** 双面角色背面卡图（doubleSided=true 时非空）；单面角色留空 */
  readonly backImagePath?: string;
  readonly isExpansion: boolean;
}

// === 梦魇牌定义 ===

export interface NightmareCardDefinition {
  readonly category: 'nightmare';
  readonly id: CardID;
  readonly name: string;
  readonly description: string;
  readonly imagePath: string;
}

// === 梦境牌定义 ===

export interface DreamCardDefinition {
  readonly category: 'dream';
  readonly id: CardID;
  readonly name: string;
  readonly description: string;
  readonly imagePath: string;
}

// === 金库牌定义 ===

export interface VaultCardDefinition {
  readonly category: 'vault';
  readonly id: CardID;
  readonly name: string;
  readonly description: string;
  readonly imagePath: string;
}

// === 贿赂牌定义 ===

export interface BribeCardDefinition {
  readonly category: 'bribe';
  readonly id: CardID;
  readonly name: string;
  readonly description: string;
  readonly imagePath: string;
}

// === 卡牌总类型 ===

export type CardDefinition =
  | ActionCardDefinition
  | CharacterDefinition
  | NightmareCardDefinition
  | DreamCardDefinition
  | VaultCardDefinition
  | BribeCardDefinition;
