// 测试 Fixtures 工厂
// 对照：plans/design/09-testing-quality.md §9.3.2
//
// 用途：生成可控的 SetupState / PlayerSetup / LayerSetup，便于单测与快照。
// 所有函数都是纯函数，返回深拷贝（不会误改模板）。

import type { Layer, CardID, Faction } from '@icgame/shared';
import type { SetupState, PlayerSetup, LayerSetup, VaultSetup, BribeSetup } from '../setup.js';
import { LAYER_COUNT } from '../config.js';

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
    { id: 'v-secret', layer: 1 as Layer, contentType: 'secret', isOpened: false, openedBy: null },
    { id: 'v-coin-1', layer: 2 as Layer, contentType: 'coin', isOpened: false, openedBy: null },
    { id: 'v-coin-2', layer: 3 as Layer, contentType: 'coin', isOpened: false, openedBy: null },
    { id: 'v-coin-3', layer: 4 as Layer, contentType: 'coin', isOpened: false, openedBy: null },
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
    schemaVersion: 1,
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
    winner: null,
    winReason: null,
    endTurn: null,
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
