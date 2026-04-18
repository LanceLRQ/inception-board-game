// @icgame/shared - 共享类型与卡牌数据

// 枚举与基础类型
export type {
  Layer,
  Faction,
  PlayerType,
  BotLevel,
  TurnPhase,
  GamePhase,
  SkillUsageScope,
  TriggerTiming,
  CardCategory,
  CardID,
  ActionSubType,
  MovementMethod,
} from './types/enums.js';

// 卡牌类型
export type {
  TargetSpec,
  EffectDescriptor,
  ActionCardDefinition,
  SkillDefinition,
  SkillCost,
  CharacterSideDefinition,
  CharacterDefinition,
  NightmareCardDefinition,
  DreamCardDefinition,
  VaultCardDefinition,
  BribeCardDefinition,
  CardDefinition,
} from './types/cards.js';

// 游戏状态类型
export type {
  PlayerID,
  PlayerState,
  LayerState,
  VaultContentType,
  VaultState,
  BribeStatus,
  BribeCardState,
  DeckState,
  MoveCounter,
  GameState,
} from './types/game.js';
