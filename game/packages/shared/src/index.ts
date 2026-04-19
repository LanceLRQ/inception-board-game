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

// 卡牌数据
export {
  THIEF_CHARACTERS,
  MASTER_CHARACTERS,
  ACTION_CARDS,
  NIGHTMARE_CARDS,
  DREAM_CARDS,
  VAULT_CARDS,
  BRIBE_CARDS,
  ALL_CARD_COUNT,
} from './cards/generated/cards.js';

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

// Base58 短链
export {
  BASE58_ALPHABET,
  DEFAULT_SHORTLINK_LENGTH,
  encodeBase58,
  isValidBase58Code,
  generateShortCode,
  generateUniqueShortCode,
  defaultRandomBytes,
} from './shortlink/base58.js';
export type { RandomBytesFn } from './shortlink/base58.js';

// 教学（B16）
export {
  initialProgress,
  getCurrentStep,
  isCompleted,
  computeProgressPercent,
  advance,
  jumpToStepId,
  validateScenario,
} from './tutorial/engine.js';
export type {
  TutorialStep,
  TutorialStepKind,
  TutorialScenario,
  TutorialProgress,
  TutorialEvent,
} from './tutorial/types.js';
export { BASICS_TUTORIAL } from './tutorial/scenarios/basics.js';

// Bot 昵称生成
export {
  BOT_NAMES_CONFIG,
  DEFAULT_UGC_BAN_WORDS,
  generateBotNickname,
  generateBatch,
  getPoolFor,
  withBotBadge,
} from './nickname/generator.js';
export type {
  BotDifficulty,
  BotNamesConfig,
  GenerateOptions,
  GenerateResult,
  Suffix,
} from './nickname/generator.js';
