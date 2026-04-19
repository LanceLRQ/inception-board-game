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

// 能力注册表
export {
  validateAllCards,
  ensureRegistered,
  getCardById,
  getSkillById,
  getAllCharacters,
  getCardsByCategory,
} from './cards/abilityRegistry.js';
export type { ValidationError } from './cards/abilityRegistry.js';

// 聊天预设短语
export {
  CHAT_PRESETS,
  findChatPreset,
  isValidChatPresetId,
  isPresetAvailableForFaction,
  getChatPresetsByCategory,
} from './chat/presets.js';
export type { ChatPresetPhrase, ChatPresetCategory, ChatPresetFaction } from './chat/presets.js';

// 像素头像
export {
  AVATAR_GRID_SIZE,
  AVATAR_PALETTES,
  cyrb53,
  mulberry32,
  generatePixelAvatar,
  avatarToSVG,
  generateRandomAvatarSeed,
} from './avatar/pixelAvatar.js';
export type { PixelAvatar } from './avatar/pixelAvatar.js';
