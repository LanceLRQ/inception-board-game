// @icgame/shared - 共享类型与卡牌数据

// 枚举与基础类型
export type {
  Layer,
  Faction,
  PlayerType,
  BotLevel,
  TurnPhase,
  GamePhase,
  CardCategory,
  CardID,
  ActionSubType,
  MovementMethod,
} from './types/enums.js';

// 卡牌类型
export type {
  ActionCardDefinition,
  SkillDefinition,
  WorldViewDefinition,
  CharacterSideDefinition,
  CharacterDefinition,
  NightmareCardDefinition,
  DreamCardDefinition,
  VaultCardDefinition,
  BribeCardDefinition,
  OtherCardDefinition,
  CardBackImages,
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
  OTHER_CARDS,
  CARD_BACK_IMAGES,
  CARD_DEFINITION_COUNT,
  CARD_COPY_COUNT,
} from './cards/generated/cards.js';

// 同名牌判定（土星·律令据此判断手牌能否抵消被打出的牌）
export { isSameNameCard } from './cards/sameName.js';

// 聊天预设短语
export {
  CHAT_BUBBLE_VISIBLE_MS,
  CHAT_COOLDOWN_MS,
  CHAT_HISTORY_LIMIT,
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

// 教学
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

// 昵称规范化与校验
export { NICKNAME_MAX_LENGTH, normalizeNickname, validateNickname } from './nickname/validate.js';
export type { NicknameValidation } from './nickname/validate.js';

// 对局人数范围（服务端、房间页、引擎共用）
export {
  MATCH_MIN_PLAYERS,
  MATCH_MAX_PLAYERS,
  isMatchPlayerCount,
  playersShortOfMinimum,
} from './rules/playerCount.js';

// 恢复码格式
export {
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_FORMATTED_LENGTH,
  RECOVERY_CODE_GROUP_SIZE,
  RECOVERY_CODE_LENGTH,
  formatRecoveryCode,
  isRecoveryCodeShape,
  normalizeRecoveryCodeInput,
} from './identity/recoveryCode.js';
