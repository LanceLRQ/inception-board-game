// 盗梦都市 - 卡牌类型定义
//
// 卡牌定义是 cards-data.json 的忠实转写：只带数据里有的信息。
// 数据里没有的语义（如行动牌的目标规则、技能触发时机）不在这里编造；
// 引擎对这些规则的实现写在 game-engine 里，不经由卡牌定义。

import type { CardID, ActionSubType, Faction } from './enums.js';

// === 行动牌定义 ===

export interface ActionCardDefinition {
  readonly category: 'action';
  readonly id: CardID;
  readonly name: string;
  /** 行动牌分类，取自手工维护的映射表（cards/actionSubTypes.ts），数据文件里没有这项信息 */
  readonly subType: ActionSubType;
  /** 牌库里这张牌的张数 */
  readonly quantity: number;
  /** 是否扩展牌（数据里没有扩展标记即为否） */
  readonly isExpansion: boolean;
  /** 卡面规则文字 */
  readonly description: string;
  /** 使用时机（卡面原文，如「你的出牌阶段」） */
  readonly useTiming: string;
  /** 使用目标（卡面原文） */
  readonly useTarget: string;
  /** 说明书里对这张牌的补充说明 */
  readonly analysis?: string;
  readonly imagePath: string;
}

// === 角色定义 ===

export interface SkillDefinition {
  /** 形如 `<角色id>.skill_<序号>`；序号从 0 起整张角色牌连续编号（双面角色的背面技能接在正面之后），只数技能，不含世界观 */
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

/** 梦主的世界观：对全局始终生效的规则 */
export interface WorldViewDefinition {
  /** 形如 `<角色id>.worldview` */
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface CharacterSideDefinition {
  readonly sideName: string;
  readonly skills: SkillDefinition[];
  /** 梦主才有 */
  readonly worldView?: WorldViewDefinition;
  /** 说明书里对这一面的补充说明 */
  readonly analysis?: string;
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
  /** 是否扩展角色（数据里带扩展标记） */
  readonly isExpansion: boolean;
}

// === 梦魇牌定义 ===

export interface NightmareCardDefinition {
  readonly category: 'nightmare';
  readonly id: CardID;
  readonly name: string;
  readonly description: string;
  readonly quantity: number;
  readonly analysis?: string;
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
  /** 一局里这种金库牌的张数 */
  readonly quantity: number;
  readonly imagePath: string;
}

// === 贿赂牌定义 ===

export interface BribeCardDefinition {
  readonly category: 'bribe';
  readonly id: CardID;
  readonly name: string;
  readonly description: string;
  /** 各人数下这种贿赂牌的张数，键为玩家人数（4 到 10） */
  readonly quantityByPlayerCount: Readonly<Record<number, number>>;
  readonly imagePath: string;
}

// === 其他牌（梦主优势、M4 卡宾枪、盗梦十诫、配置表等随盒附带的参考牌）===

export interface OtherCardDefinition {
  readonly category: 'other';
  readonly id: CardID;
  readonly name: string;
  readonly description: string;
  readonly imagePath: string;
}

// === 通用背面图 ===

/** 各类牌的通用背面图，路径相对卡图根目录；背面不是卡牌，不进任何牌表 */
export interface CardBackImages {
  readonly thief: string;
  readonly master: string;
  readonly action: string;
  readonly bribe: string;
  readonly vault: string;
  readonly nightmare: string;
}

// === 卡牌总类型 ===

export type CardDefinition =
  | ActionCardDefinition
  | CharacterDefinition
  | NightmareCardDefinition
  | DreamCardDefinition
  | VaultCardDefinition
  | BribeCardDefinition
  | OtherCardDefinition;
