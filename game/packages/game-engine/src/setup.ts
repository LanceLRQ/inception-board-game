// 游戏初始化 - Setup 阶段
// 对照：plans/design/02-game-rules-spec.md §2.2

import type { Layer, CardID, Faction } from '@icgame/shared';
import {
  PLAYER_COUNT_CONFIGS,
  VAULT_SECRET_COUNT,
  VAULT_COIN_COUNT,
  LAYER_COUNT,
} from './config.js';

export interface SetupState {
  matchId: string;
  schemaVersion: number;
  rngSeed: string;
  phase: 'setup' | 'playing' | 'endgame';
  turnPhase: 'turnStart' | 'draw' | 'action' | 'discard' | 'turnEnd';
  turnNumber: number;
  players: Record<string, PlayerSetup>;
  playerOrder: string[];
  currentPlayerID: string;
  dreamMasterID: string;
  ruleVariant: string;
  exCardsEnabled: boolean;
  expansionEnabled: boolean;
  layers: Record<number, LayerSetup>;
  vaults: VaultSetup[];
  bribePool: BribeSetup[];
  deck: DeckSetup;
  unlockThisTurn: number;
  maxUnlockPerTurn: number;
  usedNightmareIds: CardID[];
  moveCounter: number;
  activeWorldViews: CardID[];
  winner: Faction | null;
  winReason: string | null;
  endTurn: number | null;
}

export interface PlayerSetup {
  id: string;
  nickname: string;
  avatarSeed: number;
  type: 'human' | 'bot';
  botLevel?: string;
  faction: Faction;
  characterId: CardID;
  isRevealed: boolean;
  currentLayer: Layer;
  hand: CardID[];
  isAlive: boolean;
  deathTurn: number | null;
  unlockCount: number;
  shootCount: number;
  bribeReceived: number;
  skillUsedThisTurn: Record<string, number>;
  skillUsedThisGame: Record<string, number>;
  successfulUnlocksThisTurn: number;
}

export interface LayerSetup {
  layer: Layer;
  dreamCardId: CardID | null;
  nightmareId: CardID | null;
  nightmareRevealed: boolean;
  nightmareTriggered: boolean;
  playersInLayer: string[];
  heartLockValue: number;
}

export interface VaultSetup {
  id: string;
  layer: Layer;
  contentType: 'secret' | 'coin' | 'empty';
  isOpened: boolean;
  openedBy: string | null;
}

export interface BribeSetup {
  id: string;
  status: 'inPool' | 'dealt' | 'deal' | 'shattered';
  heldBy: string | null;
  originalOwnerId: string | null;
}

export interface DeckSetup {
  cards: CardID[];
  discardPile: CardID[];
}

// 创建初始游戏状态
export function createInitialState(options: {
  playerCount: number;
  playerIds: string[];
  nicknames: string[];
  rngSeed: string;
  ruleVariant?: string;
  exCardsEnabled?: boolean;
  expansionEnabled?: boolean;
}): SetupState {
  const config = PLAYER_COUNT_CONFIGS[options.playerCount];
  if (!config) {
    throw new Error(`Unsupported player count: ${options.playerCount}`);
  }

  const { playerIds, nicknames, rngSeed } = options;

  // 初始化玩家
  const players: Record<string, PlayerSetup> = {};
  const playerOrder: string[] = [];
  for (let i = 0; i < playerIds.length; i++) {
    const id = playerIds[i]!;
    players[id] = {
      id,
      nickname: nicknames[i] ?? `Player ${i + 1}`,
      avatarSeed: i ?? 0,
      type: 'human',
      faction: 'thief',
      characterId: '' as CardID,
      isRevealed: false,
      currentLayer: 1 as Layer,
      hand: [],
      isAlive: true,
      deathTurn: null,
      unlockCount: 0,
      shootCount: 0,
      bribeReceived: 0,
      skillUsedThisTurn: {},
      skillUsedThisGame: {},
      successfulUnlocksThisTurn: 0,
    };
    playerOrder.push(id);
  }

  // 初始化梦境层
  const layers: Record<number, LayerSetup> = {};
  for (let l = 1; l <= LAYER_COUNT; l++) {
    layers[l] = {
      layer: l as Layer,
      dreamCardId: null,
      nightmareId: null,
      nightmareRevealed: false,
      nightmareTriggered: false,
      playersInLayer: [],
      heartLockValue: config.heartLocks[l - 1]!,
    };
  }
  // 所有玩家初始在第 1 层
  layers[1]!.playersInLayer = [...playerOrder];

  // 初始化金库（1 秘密 + 3 金币）
  const vaults: VaultSetup[] = [];
  for (let i = 0; i < VAULT_SECRET_COUNT + VAULT_COIN_COUNT; i++) {
    const targetLayer = ((i % LAYER_COUNT) + 1) as Layer;
    vaults.push({
      id: `vault-${i}`,
      layer: targetLayer,
      contentType: i < VAULT_SECRET_COUNT ? 'secret' : 'coin',
      isOpened: false,
      openedBy: null,
    });
  }

  return {
    matchId: '',
    schemaVersion: 1,
    rngSeed,
    phase: 'setup',
    turnPhase: 'turnStart',
    turnNumber: 0,
    players,
    playerOrder,
    currentPlayerID: '',
    dreamMasterID: '',
    ruleVariant: options.ruleVariant ?? 'classic',
    exCardsEnabled: options.exCardsEnabled ?? false,
    expansionEnabled: options.expansionEnabled ?? false,
    layers,
    vaults,
    bribePool: [],
    deck: { cards: [], discardPile: [] },
    unlockThisTurn: 0,
    maxUnlockPerTurn: 1,
    usedNightmareIds: [],
    moveCounter: 0,
    activeWorldViews: [],
    winner: null,
    winReason: null,
    endTurn: null,
  };
}
