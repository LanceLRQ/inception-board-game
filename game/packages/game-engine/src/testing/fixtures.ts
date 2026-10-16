// 测试 Fixtures 工厂
//
// 用途：生成可控的 SetupState / PlayerSetup / LayerSetup，便于单测与快照。
// 所有函数都是纯函数，返回深拷贝（不会误改模板）。

import type { Layer, CardID, Faction } from '@icgame/shared';
import type { SetupState, PlayerSetup, LayerSetup, VaultSetup, BribeSetup } from '../setup.js';
import { LAYER_COUNT } from '../config.js';
import { CURRENT_SCHEMA_VERSION } from '../migrations.js';
import { InceptionCityGame } from '../game.js';
import type { MoveCtx } from '../moves/common.js';
import type { PendingDiceRoll } from '../moves/diceGate.js';
import { diceMoves } from '../moves/diceMoves.js';

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/**
 * 浅合并工具（只在顶层字段覆盖），用于 test overrides。
 * 不做深合并，子对象（如 players / layers）覆盖时整体替换。
 */
function merge<T extends object>(base: T, overrides: Partial<T>): T {
  return { ...base, ...overrides };
}

/**
 * 生成 1 个玩家状态（默认是盗梦者，活着，第 1 层，空手牌）
 */
export function makePlayer(overrides: Partial<PlayerSetup> = {}): PlayerSetup {
  return merge<PlayerSetup>(
    {
      id: overrides.id ?? 'p1',
      nickname: overrides.nickname ?? 'Player',
      avatarSeed: 0,
      type: 'human',
      faction: 'thief' as Faction,
      characterId: '' as CardID,
      isRevealed: false,
      currentLayer: 1 as Layer,
      hand: [],
      isAlive: true,
      deathTurn: null,
      layerBeforeLimbo: null,
      imperialShootCharges: 0,
      unlockCount: 0,
      shootCount: 0,
      bribeReceived: 0,
      skillUsedThisTurn: {},
      skillUsedThisGame: {},
      successfulUnlocksThisTurn: 0,
    },
    overrides,
  );
}

/**
 * 生成 1 个梦境层（默认空、心锁 3）
 */
export function makeLayer(layer: Layer, overrides: Partial<LayerSetup> = {}): LayerSetup {
  return merge<LayerSetup>(
    {
      layer,
      dreamCardId: null,
      nightmareId: null,
      nightmareRevealed: false,
      nightmareTriggered: false,
      playersInLayer: [],
      heartLockValue: 3,
    },
    overrides,
  );
}

/** 1-4 层默认层集合（空，心锁 [5,4,3,2]） */
export function makeDefaultLayers(): Record<number, LayerSetup> {
  const defaults: [number, number, number, number] = [5, 4, 3, 2];
  const out: Record<number, LayerSetup> = {};
  for (let i = 1; i <= LAYER_COUNT; i++) {
    out[i] = makeLayer(i as Layer, { heartLockValue: defaults[i - 1] ?? 3 });
  }
  return out;
}

/** 默认金库：1 秘密 + 3 金币，均分到 1-4 层 */
export function makeDefaultVaults(): VaultSetup[] {
  return [
    { id: 'v-1', layer: 1 as Layer, contentType: 'secret', isOpened: false, openedBy: null },
    { id: 'v-2', layer: 2 as Layer, contentType: 'coin', isOpened: false, openedBy: null },
    { id: 'v-3', layer: 3 as Layer, contentType: 'coin', isOpened: false, openedBy: null },
    { id: 'v-4', layer: 4 as Layer, contentType: 'coin', isOpened: false, openedBy: null },
  ];
}

/**
 * 核心工厂：生成一份可用的 SetupState 快照。
 *
 * - 默认为 5 人局（4 盗梦者 + 1 梦主），phase=setup，空牌库，空金库已就位
 * - overrides 为浅合并，嵌套对象需要完整替换（这是有意为之：避免隐式合并带来的不一致）
 *
 * @example
 *   const s = createTestState();                           // 默认 5 人
 *   const s2 = createTestState({ phase: 'playing' });      // playing 阶段
 *   const s3 = createTestState({
 *     players: { p1: makePlayer({ id: 'p1', currentLayer: 3 as Layer }) },
 *   });
 */
export function createTestState(overrides: Partial<SetupState> = {}): SetupState {
  // 默认 5 人（0-3 盗梦 + 4 梦主）
  const playerIds = ['p1', 'p2', 'p3', 'p4', 'pM'];
  const players: Record<string, PlayerSetup> = {};
  for (const id of playerIds) {
    players[id] = makePlayer({
      id,
      nickname: id,
      faction: id === 'pM' ? 'master' : 'thief',
    });
  }
  const layers = makeDefaultLayers();
  // 玩家初始都在第 1 层
  layers[1]!.playersInLayer = [...playerIds];

  const base: SetupState = {
    matchId: 'test-match',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rngSeed: 'test-seed',
    phase: 'setup',
    turnPhase: 'turnStart',
    turnNumber: 0,
    players,
    playerOrder: [...playerIds],
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    layers,
    vaults: makeDefaultVaults(),
    bribePool: [],
    deck: { cards: [], discardPile: [] },
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
    pendingVaultDecision: null,
    peekReveal: null,
    pendingLibra: null,
    mazeState: null,
    pendingAriesChoice: null,
    pendingVirgoChoice: null,
    pendingShootResponse: null,
    pendingBlackHoleLevy: null,
    pendingDarwinReturn: null,
    pendingAthenaWit: null,
    pendingSaturnDecree: null,
    pendingDiceRoll: null,
    lastDiceRoll: null,
    winner: null,
    winReason: null,
    endTurn: null,
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
    lastShootRoll: null,
    removedFromGame: [],
  };
  return merge(base, overrides);
}

/** 结构化 deep clone（JSON 往返）；仅对 JSON-safe 数据有效。 */
export function cloneState<T>(state: T): T {
  return JSON.parse(JSON.stringify(state)) as T;
}

/** 辅助：往 state 里放若干 bribe */
export function withBribes(state: SetupState, bribes: readonly Partial<BribeSetup>[]): SetupState {
  const filled: BribeSetup[] = bribes.map((b, i) => ({
    id: b.id ?? `b-${i}`,
    kind: b.kind ?? 'fail',
    status: b.status ?? 'inPool',
    heldBy: b.heldBy ?? null,
    originalOwnerId: b.originalOwnerId ?? null,
  }));
  return { ...state, bribePool: filled };
}

/** 辅助：给某玩家加手牌 */
export function withHand(state: SetupState, playerId: string, hand: CardID[]): SetupState {
  const p = state.players[playerId];
  if (!p) return state;
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...p, hand } },
  };
}

export type { DeepPartial };

// ---------------------------------------------------------------------------
// Move 调用器 + 快照切片器（行动牌快照测试基建）
// ---------------------------------------------------------------------------

/**
 * 标准 Move 调用选项。
 * - rolls: D6 / Die 结果序列（按调用顺序消费），不传则一律返回 4
 * - currentPlayer: ctx.currentPlayer，默认取 state.currentPlayerID
 * - shuffleStrategy: Shuffle 函数，默认恒等（保证快照稳定）
 */
export interface CallMoveOptions {
  rolls?: readonly number[];
  currentPlayer?: string;
  shuffleStrategy?: <T>(arr: T[]) => T[];
  /**
   * move 开了掷骰闸门时，是否按点名顺序代每个人掷骰直到闸门全部结算（续接再开的闸门也一并掷完），缺省为是。
   * 点数接着用同一串 rolls。要停在闸门上检查时传 false。
   */
  autoRoll?: boolean;
}

/**
 * 调用 phases.playing.moves 中的指定 move，统一注入 ctx / random / events。
 * 适用于纯函数式 move 单测/快照测试，不走 BGIO Client。
 */
export function callMove(
  state: SetupState,
  moveName: string,
  args: readonly unknown[],
  opts: CallMoveOptions = {},
): SetupState | 'INVALID_MOVE' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const movesMap = (InceptionCityGame as any).phases?.playing?.moves;
  if (!movesMap || typeof movesMap[moveName]?.move !== 'function') {
    throw new Error(`callMove: 未知 move "${moveName}"`);
  }
  const rolls = [...(opts.rolls ?? [])];
  const D6 = (): number => (rolls.length > 0 ? rolls.shift()! : 4);
  const Die = (max?: number): number => {
    const v = rolls.length > 0 ? rolls.shift()! : 1;
    return max ? Math.max(1, Math.min(max, v)) : v;
  };
  const Shuffle = opts.shuffleStrategy ?? (<T>(arr: T[]) => arr);

  const run = (G: SetupState, name: string, actor: string, moveArgs: readonly unknown[]) =>
    movesMap[name].move(
      {
        G,
        ctx: {
          numPlayers: G.playerOrder.length,
          currentPlayer: actor,
          playOrder: G.playerOrder,
          playOrderPos: G.playerOrder.indexOf(actor),
        },
        playerID: actor,
        random: { D6, Die, Shuffle },
        events: { endTurn: () => {}, endPhase: () => {}, endStage: () => {} },
      },
      ...moveArgs,
    ) as SetupState | 'INVALID_MOVE';

  let result = run(state, moveName, opts.currentPlayer ?? state.currentPlayerID, args);
  if (opts.autoRoll === false || moveName === 'rollDice') return result;
  while (result !== 'INVALID_MOVE' && result.pendingDiceRoll) {
    const gate = result.pendingDiceRoll;
    const next = gate.rollers.find((id) => !gate.rolled.includes(id))!;
    result = run(result, 'rollDice', next, []);
  }
  return result;
}

/**
 * 把开着的掷骰闸门掷完（直接调用 move 函数、不经运行器的测试用）：按点名顺序代还没掷的人报到，
 * 续接再开的闸门也一并掷完，点数取自传入的随机源。非法结果与没有闸门时原样返回。
 */
export function completeDiceGates<T>(result: T, random: { D6: () => number }): T {
  let current = result as unknown as SetupState | 'INVALID_MOVE';
  while (current !== 'INVALID_MOVE' && current?.pendingDiceRoll) {
    const gate: PendingDiceRoll = current.pendingDiceRoll;
    const roller = gate.rollers.find((id) => !gate.rolled.includes(id))!;
    current = diceMoves.rollDice.move({
      G: current,
      ctx: { currentPlayer: roller },
      random,
    } as unknown as MoveCtx) as SetupState | 'INVALID_MOVE';
  }
  return current as unknown as T;
}

/** 与玩家相关的快照字段（默认） */
export const DEFAULT_PLAYER_SNAPSHOT_FIELDS: readonly (keyof PlayerSetup)[] = [
  'id',
  'faction',
  'currentLayer',
  'hand',
  'isAlive',
  'characterId',
  'shootCount',
  'unlockCount',
  'bribeReceived',
];

/** 与梦境层相关的快照字段（默认） */
export const DEFAULT_LAYER_SNAPSHOT_FIELDS: readonly (keyof LayerSetup)[] = [
  'layer',
  'playersInLayer',
  'heartLockValue',
  'nightmareId',
  'nightmareRevealed',
];

/**
 * 快照切片：只取与行动牌效果相关的字段，避免无关 noise。
 * - players: 仅保留 DEFAULT_PLAYER_SNAPSHOT_FIELDS
 * - layers: 仅保留 DEFAULT_LAYER_SNAPSHOT_FIELDS
 * - deck: 仅 cards 数量 + discardPile（discardPile 是关键变化点）
 * - 显式列出 pendingX / shiftSnapshot / unlockThisTurn
 *
 * 返回的对象键序稳定（手动构造），便于 inline snapshot 比对。
 */
export interface ActionCardSnapshot {
  turnPhase: SetupState['turnPhase'];
  currentPlayerID: string;
  unlockThisTurn: number;
  moveCounter: number;
  players: Record<string, Partial<PlayerSetup>>;
  layers: Record<string, Partial<LayerSetup>>;
  deckSize: number;
  discardPile: readonly CardID[];
  removedFromGame: readonly CardID[];
  pendingUnlock: SetupState['pendingUnlock'];
  pendingGraft: SetupState['pendingGraft'];
  pendingResonance: SetupState['pendingResonance'];
  pendingGravity: SetupState['pendingGravity'];
  shiftSnapshot: SetupState['shiftSnapshot'];
  pendingResponseWindow: SetupState['pendingResponseWindow'];
}

export function pickRelevantState(state: SetupState): ActionCardSnapshot {
  const players: Record<string, Partial<PlayerSetup>> = {};
  for (const pid of state.playerOrder) {
    const p = state.players[pid];
    if (!p) continue;
    const slim: Partial<PlayerSetup> = {};
    for (const f of DEFAULT_PLAYER_SNAPSHOT_FIELDS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (slim as any)[f] = (p as any)[f];
    }
    players[pid] = slim;
  }
  const layers: Record<string, Partial<LayerSetup>> = {};
  for (const k of Object.keys(state.layers)) {
    const l = state.layers[Number(k)];
    if (!l) continue;
    const slim: Partial<LayerSetup> = {};
    for (const f of DEFAULT_LAYER_SNAPSHOT_FIELDS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (slim as any)[f] = (l as any)[f];
    }
    layers[k] = slim;
  }
  return {
    turnPhase: state.turnPhase,
    currentPlayerID: state.currentPlayerID,
    unlockThisTurn: state.unlockThisTurn,
    moveCounter: state.moveCounter,
    players,
    layers,
    deckSize: state.deck.cards.length,
    discardPile: state.deck.discardPile,
    removedFromGame: state.removedFromGame,
    pendingUnlock: state.pendingUnlock,
    pendingGraft: state.pendingGraft,
    pendingResonance: state.pendingResonance,
    pendingGravity: state.pendingGravity,
    shiftSnapshot: state.shiftSnapshot,
    pendingResponseWindow: state.pendingResponseWindow,
  };
}

/** 断言 callMove 结果非 INVALID，并窄化类型 */
export function expectMoveOk(result: SetupState | 'INVALID_MOVE'): asserts result is SetupState {
  if (result === 'INVALID_MOVE') {
    throw new Error('callMove returned INVALID_MOVE');
  }
}
