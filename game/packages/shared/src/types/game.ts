// 盗梦都市 - GameState 完整类型定义
// 对照：plans/design/03-data-model.md §3.4-§3.5

import type {
  Layer,
  Faction,
  TurnPhase,
  GamePhase,
  CardID,
  PlayerType,
  BotLevel,
} from './enums.js';

// === 玩家 ID ===
export type PlayerID = string;

// === 玩家状态 ===

export interface PlayerState {
  readonly id: PlayerID;
  readonly nickname: string;
  readonly avatarSeed: number;
  readonly type: PlayerType;
  readonly botLevel?: BotLevel;

  // 角色
  readonly faction: Faction;
  readonly characterId: CardID;
  readonly isRevealed: boolean;

  // 位置
  readonly currentLayer: Layer;

  // 手牌
  readonly hand: CardID[];

  // 存活
  readonly isAlive: boolean;
  readonly deathTurn: number | null;

  // 统计
  readonly unlockCount: number;
  readonly shootCount: number;
  readonly bribeReceived: number;

  // 能力使用追踪
  readonly skillUsedThisTurn: Record<string, number>;
  readonly skillUsedThisGame: Record<string, number>;
}

// === 梦境层状态 ===

export interface LayerState {
  readonly layer: Layer;
  readonly dreamCardId: CardID;
  readonly nightmareId: CardID | null;
  readonly nightmareRevealed: boolean;
  readonly nightmareTriggered: boolean;
  readonly playersInLayer: PlayerID[];
}

// === 金库状态 ===

export type VaultContentType = 'secret' | 'coin' | 'empty';

export interface VaultState {
  readonly id: string;
  readonly layer: Layer;
  readonly contentType: VaultContentType;
  readonly isOpened: boolean;
  readonly openedBy: PlayerID | null;
}

// === 贿赂牌状态 ===

export type BribeStatus = 'inPool' | 'dealt' | 'deal' | 'shattered';

export interface BribeCardState {
  readonly id: string;
  readonly status: BribeStatus;
  readonly heldBy: PlayerID | null;
  readonly originalOwnerId: PlayerID | null;
}

// === 牌库状态 ===

export interface DeckState {
  readonly cards: CardID[];
  readonly discardPile: CardID[];
}

// === Move 计数器 ===

export interface MoveCounter {
  readonly counter: number;
  readonly intentId: string;
}

// === 完整游戏状态 ===

export interface GameState {
  // 元数据
  readonly matchId: string;
  readonly version: number;
  readonly rngSeed: string;

  // 阶段
  readonly phase: GamePhase;
  readonly turnPhase: TurnPhase;
  readonly turnNumber: number;

  // 玩家
  readonly players: Record<PlayerID, PlayerState>;
  readonly playerOrder: PlayerID[];
  readonly currentPlayerID: PlayerID;
  readonly dreamMasterID: PlayerID;

  // 规则变体
  readonly ruleVariant: string;
  readonly exCardsEnabled: boolean;
  readonly expansionEnabled: boolean;

  // 层
  readonly layers: Record<Layer, LayerState>;

  // 金库
  readonly vaults: VaultState[];

  // 贿赂牌
  readonly bribePool: BribeCardState[];

  // 牌库
  readonly deck: DeckState;

  // 回合内解锁计数
  readonly unlockThisTurn: number;
  readonly maxUnlockPerTurn: number;

  // 已使用的梦魇牌 ID
  readonly usedNightmareIds: CardID[];

  // Move 计数器
  readonly moveCounter: MoveCounter;

  // 世界观
  readonly activeWorldViews: CardID[];

  // 胜负
  readonly winner: Faction | null;
  readonly winReason: string | null;
  readonly endTurn: number | null;
}
