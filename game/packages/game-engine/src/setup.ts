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
  // 万有引力：多目标手牌池 + 轮流挑选
  // 对照：docs/manual/04-action-cards.md 万有引力
  pendingGravity: {
    bonderPlayerID: string;
    targetIds: string[];
    pool: CardID[];
    pickOrder: string[]; // 从 bonder 起按 playOrder 顺序
    pickCursor: number;
  } | null;
  // 移形换影（EX）：当回合开始时快照；回合末强制还原
  // 对照：docs/manual/04-action-cards.md 移形换影
  shiftSnapshot: Record<string, CardID> | null;
  // 响应窗口（能力系统）
  // 对照：plans/design/02-game-rules-spec.md §2.4.2
  pendingResponseWindow: import('./engine/abilities/response-chain.js').ResponseWindowState | null;
  // 梦境窥视 · 梦主决策等待态
  //   规则：盗梦者使用【梦境窥视】效果①时，梦主先决定是否给 1 张贿赂牌 → 然后盗梦者查看金库
  //   对照：docs/manual/04-action-cards.md 梦境窥视 效果① / plans/report/phase3-out-of-turn-interaction-review.md OOT-02
  //   生命周期：playPeek 挂起（若贿赂池有可派牌） → masterPeekBribeDecision 清空
  //   若贿赂池已派完 → playPeek 跳过该步，直接设置 peekReveal
  pendingPeekDecision: {
    peekerID: string;
    targetLayer: number;
  } | null;
  // 梦境窥视 · 私密展示态（playerView 授权分支消费）
  //   revealKind='vault'：效果①（盗梦者使用），仅对 peekerID 视角透传 vaultLayer 对应的 vault 内容
  //   revealKind='bribe'：效果②（梦主使用，W19-B F10），仅对 peekerID(=梦主) 视角透传
  //                     targetThiefID 持有的贿赂牌内容（为未来梦主隐私收紧预留授权入口）
  //   生命周期：playPeek / masterPeekBribeDecision / playPeekMaster 挂起 → peekerAcknowledge 清空
  //   对照：docs/manual/04-action-cards.md 梦境窥视 效果①/效果②
  peekReveal:
    | { peekerID: string; revealKind: 'vault'; vaultLayer: number }
    | { peekerID: string; revealKind: 'bribe'; targetThiefID: string }
    | null;
  // 天秤·平衡：bonder 把所有手牌交给 target；target 分两份；bonder 选 1 份取走
  // 对照：docs/manual/05-dream-thieves.md 天秤
  pendingLibra: {
    bonderPlayerID: string;
    targetPlayerID: string;
    /** target 提交的分组（提交后填入） */
    split: { pile1: CardID[]; pile2: CardID[] } | null;
  } | null;
  // 意念判官·定罪：SHOOT 双骰待选（两步 move 中间态）
  // 对照：docs/manual/05-dream-thieves.md 意念判官
  pendingSudgerRolls?: {
    rollA: number;
    rollB: number;
    targetPlayerID: string;
    cardId: CardID;
    deathFaces: number[];
    moveFaces: number[];
    extraOnMove: 'discard_unlocks' | 'discard_shoots' | null;
  } | null;
  // 筑梦师·迷宫：被困玩家在其下回合结束前不受行动牌+技能影响、不能移动
  // 对照：docs/manual/05-dream-thieves.md 筑梦师
  mazeState: {
    mazedPlayerID: string;
    /** 解除时机：被困者的"下个回合 turnNumber"，到达 turnEnd 后清除 */
    untilTurnNumber: number;
  } | null;
  winner: Faction | null;
  winReason: string | null;
  endTurn: number | null;
  // 出牌追踪（Phase 3 坑③子系统基础设施）
  // 本回合内按时序记录每次成功打出的行动牌 cardId（SHOOT 变体也计入）。
  // 消费方：水星·航路 / 金星·镜界 / 格林射线 等依赖"上一张打出的牌"的能力。
  // 生命周期：turn.onBegin 清空；每个 playXxx move 成功结算后 push。
  // 对照：plans/design/02-game-rules-spec.md §2.4 · abilities registry R4 deferred
  playedCardsThisTurn: CardID[];
  /** 最近一次打出的行动牌 cardId（便于 O(1) 查询；同 playedCardsThisTurn 末元素） */
  lastPlayedCardThisTurn: CardID | null;
  /**
   * 移出游戏的牌堆（不入弃牌堆，无法被药剂师 / 火星·战场世界观等回收）。
   * 对照：docs/manual/04-action-cards.md 时间风暴 "使用后此牌移出游戏"
   * 目前用途：
   *  - 时间风暴（使用或弃牌阶段弃掉时）：该牌本身 + 被翻的 10 张牌库顶
   */
  removedFromGame: CardID[];
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
  /**
   * 小丑·赌博：下一次本玩家回合 discard 阶段强制清空手牌。
   * 记录设防时的 turnNumber；discard 检查时若 `armedAtTurn < G.turnNumber` 则触发后清空标记。
   * 这样保证本回合 discard 不会误触发（本回合 armed===turnNumber，不满足 <）。
   */
  forcedDiscardArmedAtTurn?: number | null;
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

  // 初始化梦境层 + 梦魇派发
  // 对照：docs/manual/07-nightmare-cards.md / docs/manual/02-game-setup.md
  // MVP：按种子洗牌 6 张梦魇，前 4 张面朝下放到 L1-L4
  const nightmarePool: CardID[] = [
    'nightmare_space_fall',
    'nightmare_despair_storm',
    'nightmare_hunger_bite',
    'nightmare_echo',
    'nightmare_plague',
    'nightmare_vortex',
  ];
  const shuffledNightmares = seededShuffle(nightmarePool, rngSeed + ':nightmare');

  const layers: Record<number, LayerSetup> = {};
  for (let l = 1; l <= LAYER_COUNT; l++) {
    layers[l] = {
      layer: l as Layer,
      dreamCardId: null,
      nightmareId: shuffledNightmares[l - 1] ?? null,
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
    pendingGravity: null,
    shiftSnapshot: null,
    pendingResponseWindow: null,
    pendingPeekDecision: null,
    peekReveal: null,
    pendingLibra: null,
    pendingSudgerRolls: null,
    mazeState: null,
    winner: null,
    winReason: null,
    endTurn: null,
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
    removedFromGame: [],
  };
}
