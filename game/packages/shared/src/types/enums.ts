// 盗梦都市 - 核心枚举与基础类型
// 对照：plans/design/03-data-model.md §3.1-§3.2

// 层级（0=迷失层）
export type Layer = 0 | 1 | 2 | 3 | 4;

// 阵营
export type Faction = 'thief' | 'master';

// 玩家类型
export type PlayerType = 'human' | 'bot';

// Bot 难度
export type BotLevel = 'random' | 'heuristic' | 'strategy';

// 回合阶段
export type TurnPhase = 'turnStart' | 'draw' | 'action' | 'discard' | 'turnEnd';

// 游戏阶段
export type GamePhase = 'setup' | 'playing' | 'endgame';

// 技能使用域
export type SkillUsageScope =
  | 'ownTurnOncePerTurn'
  | 'anyTurnOncePerTurnEach'
  | 'ownTurnLimitN'
  | 'perGameLimitN'
  | 'unlimited';

// 触发时机
export type TriggerTiming =
  | 'onTurnStart'
  | 'onDrawPhase'
  | 'onActionPhase'
  | 'onDiscardPhase'
  | 'onTurnEnd'
  | 'onBeforeShoot'
  | 'onAfterShoot'
  | 'onUnlock'
  | 'onUnlockCanceled'
  | 'onBribe'
  | 'onBribeCanceled'
  | 'onDeath'
  | 'onRevive'
  | 'onLayerChange'
  | 'onCardPlayed'
  | 'onPhaseEnd'
  | 'onGameEnd'
  | 'always';

// 卡牌类别
export type CardCategory =
  | 'action'
  | 'thief_char'
  | 'master_char'
  | 'dream'
  | 'vault'
  | 'bribe'
  | 'nightmare';

export type CardID = string;

// 行动牌子类型
export type ActionSubType =
  | 'shoot_basic'
  | 'shoot_special'
  | 'shoot_hybrid'
  | 'unlock'
  | 'dream_serum'
  | 'kick'
  | 'dream_peek'
  | 'pull'
  | 'fabrication'
  | 'shapeshift'
  | 'death_declaration'
  | 'resonance'
  | 'time_storm'
  | 'nightmare_unlock'
  | 'gravity'
  | 'graft';

// 移动方式
export type MovementMethod =
  | 'dreamSerum'
  | 'shoot'
  | 'kick'
  | 'pull'
  | 'freeMove'
  | 'shadeFollow'
  | 'touristSupport'
  | 'avatarAscend'
  | 'piscesLeak'
  | 'piscesBaptism'
  | 'gaiaShake'
  | 'bhAbsorb'
  | 'secretPassage'
  | 'revive'
  | 'kill'
  | 'lose';
