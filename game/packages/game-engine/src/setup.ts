// 游戏初始化 - Setup 阶段
// 对照：plans/design/02-game-rules-spec.md §2.2

import type { Layer, CardID, Faction } from '@icgame/shared';
import { ACTION_CARDS } from '@icgame/shared';
import {
  PLAYER_COUNT_CONFIGS,
  VAULT_SECRET_COUNT,
  VAULT_COIN_COUNT,
  LAYER_COUNT,
} from './config.js';

/**
 * 构建行动牌牌库
 * 对照：plans/design/02-game-rules-spec.md §2.2 / docs/manual/04-action-cards.md
 * 按每张牌 quantity 字段展开，跳过扩展牌与占位的 "action_back"（背面）
 */
/**
 * 构建初始贿赂池
 * 对照：docs/manual/03-game-flow.md 贿赂&背叛者
 * MVP 固定 3 DEAL + 3 fail；洗牌由派发时用 BGIO random.Shuffle 处理
 */
function buildInitialBribePool(): BribeSetup[] {
  const out: BribeSetup[] = [];
  for (let i = 0; i < 3; i++) {
    out.push({
      id: `bribe-deal-${i}`,
      status: 'inPool',
      heldBy: null,
      originalOwnerId: null,
    });
  }
  for (let i = 0; i < 3; i++) {
    out.push({
      id: `bribe-fail-${i}`,
      status: 'inPool',
      heldBy: null,
      originalOwnerId: null,
    });
  }
  return out;
}

function buildInitialDeck(expansionEnabled: boolean, rngSeed: string): CardID[] {
  const cards: CardID[] = [];
  for (const def of ACTION_CARDS) {
    if (def.id === 'action_back') continue;
    if (def.isExpansion && !expansionEnabled) continue;
    const qty = Math.max(1, def.quantity ?? 1);
    for (let i = 0; i < qty; i++) cards.push(def.id as CardID);
  }
  return seededShuffle(cards, rngSeed);
}

/**
 * 带种子的洗牌（Fisher-Yates + mulberry32）
 * 与 bot/matchRunner 使用同款 PRNG，保证可复现性
 */
function seededShuffle<T>(input: readonly T[], seed: string): T[] {
  const out = [...input];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  const rand = (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

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
  pendingUnlock: {
    playerID: string;
    layer: number;
    cardId: CardID;
  } | null;
  // 嫁接两阶段：playGraft 后记录，resolveGraft 消费
  // 对照：docs/manual/04-action-cards.md 嫁接（抽 3 返 2）
  pendingGraft: {
    playerID: string;
  } | null;
  // 共鸣：本回合 bonder 持有 target 的手牌，弃牌阶段前归还己手牌
  // 对照：docs/manual/04-action-cards.md 共鸣
  pendingResonance: {
    bonderPlayerID: string;
    targetPlayerID: string;
  } | null;
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
    bribePool: buildInitialBribePool(),
    deck: {
      cards: buildInitialDeck(options.expansionEnabled ?? false, rngSeed),
      discardPile: [],
    },
    unlockThisTurn: 0,
    maxUnlockPerTurn: 1,
    usedNightmareIds: [],
    moveCounter: 0,
    activeWorldViews: [],
    pendingUnlock: null,
    pendingGraft: null,
    pendingResonance: null,
    winner: null,
    winReason: null,
    endTurn: null,
  };
}
