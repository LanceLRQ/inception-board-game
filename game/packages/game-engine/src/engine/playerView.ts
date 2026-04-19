// PlayerView 5 层过滤 - 零信任隐藏信息
// 对照：plans/design/08-security-ai.md §8.4d + plans/design/07-backend-network.md §7.9b
//
// 过滤层次：
//   L1 手牌：非 viewer 的 hand → 数量化
//   L2 金库：未开的 contentType 隐藏（梦主可见）
//   L3 贿赂：bribePool 内容 / 其他玩家持有的贿赂牌隐藏（梦主可见全部）
//   L4 牌库：deck.cards[] → deckCount；discardPile 保留（已公开）
//   L5 事件日志：按观察者过滤（外部调用，engine 层不存 log，预留接口）

import type { SetupState, PlayerSetup, VaultSetup, BribeSetup, DeckSetup } from '../setup.js';
import type { CardID } from '@icgame/shared';

// === 过滤后的类型 ===

export interface FilteredPlayer extends Omit<
  PlayerSetup,
  'hand' | 'skillUsedThisTurn' | 'skillUsedThisGame'
> {
  readonly hand: CardID[] | null; // null 表示被过滤；数组表示可见
  readonly handCount: number;
  readonly skillUsedThisTurn?: Record<string, number>;
  readonly skillUsedThisGame?: Record<string, number>;
}

export interface FilteredVault extends Omit<VaultSetup, 'contentType'> {
  readonly contentType: VaultSetup['contentType'] | 'hidden';
}

export interface FilteredBribe extends Omit<BribeSetup, 'status' | 'heldBy' | 'originalOwnerId'> {
  readonly status: BribeSetup['status'] | 'hidden';
  readonly heldBy: string | null;
  readonly originalOwnerId: string | null;
}

export interface FilteredDeck extends Omit<DeckSetup, 'cards'> {
  readonly cards: CardID[] | null; // null 表示被过滤
  readonly cardCount: number;
  readonly discardPile: CardID[];
}

export type FilteredState = Omit<SetupState, 'players' | 'vaults' | 'bribePool' | 'deck'> & {
  readonly players: Record<string, FilteredPlayer>;
  readonly vaults: FilteredVault[];
  readonly bribePool: FilteredBribe[];
  readonly deck: FilteredDeck;
  readonly _filteredFor: string; // 标记视角，防误用
};

// === 过滤入口 ===

export interface FilterOptions {
  /** 覆盖视角（测试/回放场景）。默认 = viewerID */
  readonly spectator?: boolean;
  /** 观战者默认屏蔽所有隐私 */
}

/**
 * 为 viewerID 过滤完整 GameState。
 * 调用此函数之后得到的状态可以安全广播给该 viewer。
 */
export function filterFor(
  state: SetupState,
  viewerID: string | null,
  opts: FilterOptions = {},
): FilteredState {
  const isSpectator = opts.spectator === true || viewerID === null;
  const isMaster = !isSpectator && viewerID === state.dreamMasterID;

  return {
    ...state,
    players: filterPlayers(state.players, viewerID, isMaster, isSpectator),
    vaults: filterVaults(state.vaults, isMaster),
    bribePool: filterBribes(state.bribePool, viewerID, isMaster, isSpectator),
    deck: filterDeck(state.deck),
    _filteredFor: viewerID ?? '__spectator__',
  };
}

// === L1 · 手牌过滤 ===

function filterPlayers(
  players: Record<string, PlayerSetup>,
  viewerID: string | null,
  isMaster: boolean,
  isSpectator: boolean,
): Record<string, FilteredPlayer> {
  const result: Record<string, FilteredPlayer> = {};
  for (const [pid, p] of Object.entries(players)) {
    const isSelf = pid === viewerID;
    // 默认隐藏手牌：只有本人可见完整手牌
    // 梦主：不可见盗梦者手牌（除非规则授权，默认按原版）
    // 观战：全部隐藏
    const canSeeHand = isSelf && !isSpectator;
    result[pid] = {
      ...p,
      hand: canSeeHand ? [...p.hand] : null,
      handCount: p.hand.length,
      skillUsedThisTurn: isSelf ? { ...p.skillUsedThisTurn } : undefined,
      skillUsedThisGame: isSelf ? { ...p.skillUsedThisGame } : undefined,
    };
    // 梦主身份：对盗梦者隐藏（isRevealed=false 时）
    if (!isSelf && !p.isRevealed && !isSpectator) {
      // 梦主对盗梦者不隐藏（梦主视角知道所有玩家阵营？按规则：不知道）
      // 规则：梦主不知道盗梦者具体角色，盗梦者也不知道彼此角色
      // 未翻面角色隐藏 characterId 和 faction
      result[pid] = {
        ...result[pid]!,
        characterId: '' as CardID,
        faction: isMaster ? p.faction : ('thief' as const),
      };
    }
  }
  return result;
}

// === L2 · 金库过滤 ===

function filterVaults(vaults: VaultSetup[], isMaster: boolean): FilteredVault[] {
  return vaults.map((v) => ({
    ...v,
    // 未开金库：盗梦者不可见内容；梦主可见全部；已开可见
    contentType: v.isOpened || isMaster ? v.contentType : ('hidden' as const),
  }));
}

// === L3 · 贿赂过滤 ===

function filterBribes(
  bribes: BribeSetup[],
  viewerID: string | null,
  isMaster: boolean,
  isSpectator: boolean,
): FilteredBribe[] {
  return bribes.map((b) => {
    const isHolder = !isSpectator && viewerID !== null && b.heldBy === viewerID;
    // 梦主 + 持有者：可见 status
    // 其他玩家：只见 inPool/dealt，看不到最终 deal/shattered
    const canSeeStatus = isMaster || isHolder;
    const canSeeOwner = isMaster || isHolder;

    // inPool 状态：除梦主外都看不到池中内容细节
    if (b.status === 'inPool' && !isMaster) {
      return {
        ...b,
        status: 'hidden' as const,
        heldBy: null,
        originalOwnerId: null,
      };
    }

    return {
      ...b,
      status: canSeeStatus ? b.status : b.status === 'inPool' ? 'hidden' : ('dealt' as const),
      heldBy: b.heldBy, // 持有人本身公开
      originalOwnerId: canSeeOwner ? b.originalOwnerId : null,
    };
  });
}

// === L4 · 牌库过滤 ===

function filterDeck(deck: DeckSetup): FilteredDeck {
  return {
    cards: null,
    cardCount: deck.cards.length,
    discardPile: [...deck.discardPile],
  };
}

// === L5 · 事件日志过滤（接口，engine 层不存 log）===

export interface EventLogEntry {
  readonly eventKind: string;
  readonly actor?: string;
  readonly targets?: string[];
  readonly visibility?: 'public' | 'self' | 'master' | 'actor+target';
  readonly payload: unknown;
}

/**
 * 过滤事件日志：根据 visibility 决定 viewer 是否可见。
 * 返回可见子集 + 敏感字段脱敏。
 */
export function filterEventLog(
  log: readonly EventLogEntry[],
  viewerID: string | null,
  dreamMasterID: string,
): EventLogEntry[] {
  if (viewerID === null) {
    return log.filter((e) => (e.visibility ?? 'public') === 'public');
  }
  const isMaster = viewerID === dreamMasterID;
  return log
    .filter((e) => {
      const vis = e.visibility ?? 'public';
      if (vis === 'public') return true;
      if (vis === 'master') return isMaster;
      if (vis === 'self') return e.actor === viewerID;
      if (vis === 'actor+target') {
        return e.actor === viewerID || (e.targets ?? []).includes(viewerID);
      }
      return true;
    })
    .map((e) => ({ ...e }));
}

// === 便捷断言：开发环境下检查过滤正确性 ===

export function assertNoLeakage(filtered: FilteredState, viewerID: string | null): void {
  // 断言：非 viewer 的 hand 必须为 null
  for (const [pid, p] of Object.entries(filtered.players)) {
    if (pid !== viewerID && p.hand !== null) {
      throw new Error(`LEAK: player ${pid} hand visible to ${viewerID}`);
    }
  }
  // 断言：deck.cards 必须为 null
  if (filtered.deck.cards !== null) {
    throw new Error('LEAK: deck.cards visible');
  }
}
