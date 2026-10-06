// 对局界面控制层的纯推导：不依赖 React，输入是按座位裁剪过的视图，输出是界面要用的数据与参数。
// useMatchController 只负责把这些函数接到状态与回调上。

import type {
  MatchView,
  MatchViewState,
  PlayerView,
  RunnerCtx,
  SeatInfo,
} from '@icgame/game-engine';
import { actionMoveFor, getCardName } from '../../lib/cards';
import { getCardImageUrl } from '../../lib/cardImages';
import type { ActiveSkillContext } from '../../lib/activeSkills';
import type { LayerMapProps } from '../LayerMap';
import { seatMarkers } from './seatMarkers';
import type { HandCardItem, HandCardMode, PendingPlay, PlayerRow } from './controllerTypes';

/** 手牌上限：弃牌阶段超出的张数必须弃掉 */
export const HAND_LIMIT = 5;

/**
 * 取出界面使用的视图。
 * 协议里视图的 G 是不透明类型；来源交付的就是按本人座位裁剪过的对局视图，这里集中收窄一次。
 */
export function viewOf(view: MatchViewState | null): { G: MatchView; ctx: RunnerCtx } | null {
  if (view === null) return null;
  return { G: view.G as MatchView, ctx: view.ctx };
}

// ---------------------------------------------------------------------------
// 胜负
// ---------------------------------------------------------------------------

/**
 * 胜负优先读运行器 ctx.gameover（引擎 endIf 返回时写入），再回退 G.winner。
 * 只看 G.winner 会导致对局结束后按钮仍可点击，move 被运行器拒绝。
 */
export function deriveOutcome(
  G: Pick<MatchView, 'winner' | 'winReason'> | undefined,
  ctx: Pick<RunnerCtx, 'gameover'> | undefined,
): { winner: string | null; winReason: string | null } {
  const gameover = ctx?.gameover as { winner?: string; reason?: string } | undefined;
  const winner = (gameover?.winner ?? (G?.winner as string | null | undefined)) || null;
  const winReason = (gameover?.reason ?? (G?.winReason as string | null | undefined)) || null;
  return { winner, winReason };
}

// ---------------------------------------------------------------------------
// 手牌
// ---------------------------------------------------------------------------

export interface HandModeInput {
  readonly turnPhase: string;
  readonly isMyTurn: boolean;
  readonly winner: string | null;
  /** 超出手牌上限的张数 */
  readonly overHand: number;
}

/** 超出手牌上限的张数 */
export function overflowCount(handSize: number): number {
  return Math.max(0, handSize - HAND_LIMIT);
}

/** 一张手牌此刻的用途：弃牌阶段选牌 / 行动阶段可出 / 只读 */
export function handCardMode(card: string, input: HandModeInput): HandCardMode {
  const { turnPhase, isMyTurn, winner, overHand } = input;
  const isDiscardSelect = turnPhase === 'discard' && overHand > 0 && isMyTurn && !winner;
  if (isDiscardSelect) return 'discard';
  const isActionPlayable = turnPhase === 'action' && isMyTurn && !winner && !!actionMoveFor(card);
  return isActionPlayable ? 'play' : 'idle';
}

/** 只保留仍在手牌里、且此刻确实处于本人弃牌阶段的弃牌选择，避免残留 */
export function effectiveDiscardSelection(
  selected: readonly string[],
  hand: readonly string[],
  turnPhase: string,
  isMyTurn: boolean,
): string[] {
  return turnPhase === 'discard' && isMyTurn ? selected.filter((c) => hand.includes(c)) : [];
}

export interface HandItemsInput extends HandModeInput {
  /** 已生效的弃牌选择（见 effectiveDiscardSelection） */
  readonly selectedDiscard: readonly string[];
  /** 当前有效出牌意图对应的牌 */
  readonly pendingCard: string | null | undefined;
}

/** 手牌展示项：每张牌带上用途、是否被选中、是否是当前出牌意图 */
export function deriveHandItems(hand: readonly string[], input: HandItemsInput): HandCardItem[] {
  return hand.map((card, index) => {
    const mode = handCardMode(card, input);
    return {
      card,
      index,
      name: getCardName(card),
      imageUrl: getCardImageUrl(card),
      mode,
      selected: mode === 'discard' && input.selectedDiscard.includes(card),
      pending: input.pendingCard === card,
    };
  });
}

/** 切换弃牌选择：已选则取消，未选则加入；不能超过需要弃的数量（超过时原样返回 prev） */
export function toggleDiscardSelection(prev: string[], card: string, overHand: number): string[] {
  const idx = prev.indexOf(card);
  if (idx >= 0) {
    const next = [...prev];
    next.splice(idx, 1);
    return next;
  }
  if (prev.length >= overHand) return prev; // 不能超过要弃数量
  return [...prev, card];
}

/** 最多选两个的切换：已选则取消；已有两个时丢掉最早的、保留最后 2 个（棋局易位、嫁接共用） */
export function toggleKeepLastTwo<T>(prev: readonly T[], item: T): T[] {
  if (prev.includes(item)) return prev.filter((x) => x !== item);
  if (prev.length >= 2) return [prev[1]!, item];
  return [...prev, item];
}

/** 万有引力的目标选择：最多 2 个，已选再点则取消；满了再点新的不生效（原样返回 prev） */
export function toggleGravityTargets(prev: string[], playerID: string): string[] {
  const idx = prev.indexOf(playerID);
  if (idx >= 0) {
    const next = [...prev];
    next.splice(idx, 1);
    return next;
  }
  if (prev.length >= 2) return prev;
  return [...prev, playerID];
}

// ---------------------------------------------------------------------------
// 出牌意图与参数
// ---------------------------------------------------------------------------

/** 手牌对应的出牌意图；这张牌不能在行动阶段打出返回 null */
export function pendingPlayFor(card: string): PendingPlay | null {
  const action = actionMoveFor(card);
  if (!action) return null;
  return {
    card,
    move: action.move,
    needsTarget: action.needsTarget,
    argOrder: action.argOrder,
  };
}

/** 梦境穿梭剂选定模式后的出牌意图 */
export function dreamTransitPending(card: string, mode: 'shoot' | 'transit'): PendingPlay {
  return {
    card,
    move: 'playShootDreamTransit',
    needsTarget: mode === 'shoot' ? 'player' : 'layer',
    argOrder: 'card_first',
    dreamMode: mode,
  };
}

/** 出牌意图必须仍在行动阶段、轮到本人、牌还在手里，否则视为已失效 */
export function effectivePendingPlay(
  pending: PendingPlay | null,
  turnPhase: string,
  isMyTurn: boolean,
  hand: readonly string[],
): PendingPlay | null {
  return pending && turnPhase === 'action' && isMyTurn && hand.includes(pending.card)
    ? pending
    : null;
}

const SHOOT_MOVES: readonly string[] = [
  'playShoot',
  'playShootKing',
  'playShootArmor',
  'playShootBurst',
];

/** 是否是 SHOOT 系列 move（末位可附死亡宣言） */
export function isShootMove(move: string): boolean {
  return SHOOT_MOVES.includes(move);
}

/** 当前出牌意图是否是 SHOOT（含梦境穿梭剂的 SHOOT 模式） */
export function isShootPlay(pending: PendingPlay): boolean {
  return (
    isShootMove(pending.move) ||
    (pending.dreamMode === 'shoot' && pending.move === 'playShootDreamTransit')
  );
}

/** 手牌里的死亡宣言 */
export function decreeCardsIn(hand: readonly string[]): string[] {
  return hand.filter((c) => c.startsWith('action_death_decree_'));
}

/** 此刻是否应显示死亡宣言可选项：SHOOT 系出牌，且手里有宣言牌 */
export function decreeApplicable(pending: PendingPlay | null, hand: readonly string[]): boolean {
  if (!pending) return false;
  return isShootPlay(pending) && decreeCardsIn(hand).length > 0;
}

/**
 * 拼出牌 move 的参数。
 *   - 无目标：[牌]
 *   - 目标玩家：梦境穿梭剂 (牌, 模式, 目标[, 宣言])；card_first (牌, 目标)；target_first (目标, 牌[, 宣言])
 *   - 目标层：梦境穿梭剂 (牌, 模式, 层)；其余 (牌, 层)
 * 死亡宣言只附在 SHOOT 系：穿梭剂的 shoot 模式，或 target_first 的 SHOOT 系 move。
 */
export function buildPlayArgs(
  pending: PendingPlay,
  target?: string | number,
  decree: string | null = null,
): unknown[] {
  if (pending.needsTarget === 'none') return [pending.card];
  if (pending.needsTarget === 'layer') {
    return pending.dreamMode ? [pending.card, pending.dreamMode, target] : [pending.card, target];
  }
  if (pending.dreamMode) {
    // playShootDreamTransit(cardId, mode, target, decree?)
    const args: unknown[] = [pending.card, pending.dreamMode, target];
    return decree && pending.dreamMode === 'shoot' ? [...args, decree] : args;
  }
  if (pending.argOrder === 'card_first') return [pending.card, target];
  // SHOOT 系列：末位可附 decree
  const args: unknown[] = [target, pending.card];
  return decree && isShootMove(pending.move) ? [...args, decree] : args;
}

// ---------------------------------------------------------------------------
// SHOOT 结算提示
// ---------------------------------------------------------------------------

/** 各玩家当前所在层 */
export function layersOfPlayers(
  players: Record<string, Pick<PlayerView, 'currentLayer'>> | undefined,
): Record<string, number> {
  const layers: Record<string, number> = {};
  for (const [id, p] of Object.entries(players ?? {})) {
    layers[id] = (p.currentLayer as number) ?? 0;
  }
  return layers;
}

export type ShootOutcome =
  | { kind: 'pending' }
  | { kind: 'kill'; playerID: string; layer: number }
  | { kind: 'move'; playerID: string; layer: number }
  | { kind: 'miss' };

/**
 * SHOOT 结果分级：
 *   - 有挂起的位移选择（L2/L3）：不提示，由选层弹窗承担
 *   - 某玩家所在层从 N 变为 0：击杀
 *   - 某玩家所在层变化（非 0）：位移
 *   - 所有玩家所在层都没变：未命中
 * 取第一个发生变化的玩家。
 */
export function classifyShoot(
  prevLayers: Record<string, number>,
  nextLayers: Record<string, number>,
  hasPendingShootMove: boolean,
): ShootOutcome {
  if (hasPendingShootMove) return { kind: 'pending' };
  for (const [id, layer] of Object.entries(nextLayers)) {
    const prevLayer = prevLayers[id];
    if (prevLayer !== undefined && prevLayer !== layer) {
      return layer === 0
        ? { kind: 'kill', playerID: id, layer }
        : { kind: 'move', playerID: id, layer };
    }
  }
  return { kind: 'miss' };
}

/** SHOOT 结果对应的提示等级与文案；挂起中不提示 */
export function shootToastFor(
  outcome: ShootOutcome,
  cardName: string,
  nameOf: (playerID: string) => string,
): { level: 'error' | 'info' | 'warn'; text: string } | null {
  switch (outcome.kind) {
    case 'pending':
      return null;
    case 'kill':
      return { level: 'error', text: `${cardName} 击杀 · ${nameOf(outcome.playerID)}` };
    case 'move':
      return {
        level: 'info',
        text: `${cardName} 命中 · ${nameOf(outcome.playerID)} 被推至 L${outcome.layer}`,
      };
    case 'miss':
      return { level: 'warn', text: `${cardName} 未命中 · 目标无位移` };
  }
}

// ---------------------------------------------------------------------------
// 角色主动技能面板
// ---------------------------------------------------------------------------

export interface SkillContextInput {
  readonly G: MatchView;
  readonly seat: string | null;
  readonly isMyTurn: boolean;
  /** 本人手牌 */
  readonly hand: readonly string[];
}

/** 主动技能可用性判断所需的上下文 */
export function buildActiveSkillContext(input: SkillContextInput): ActiveSkillContext {
  const { G, seat, isMyTurn, hand } = input;
  const players = G.players;
  const humanPlayer = seat === null ? undefined : players?.[seat];
  const dreamMasterID = G.dreamMasterID ?? '';
  const masterPlayer = players?.[dreamMasterID];
  const masterLayer =
    typeof masterPlayer?.currentLayer === 'number' ? (masterPlayer.currentLayer as number) : 0;
  const hasPending =
    !!G.pendingUnlock ||
    !!G.pendingGraft ||
    !!G.pendingGravity ||
    !!G.pendingLibra ||
    !!G.pendingResponseWindow;
  const humanFaction = (humanPlayer?.faction as string) ?? 'thief';
  const humanLayer = (humanPlayer?.currentLayer as number) ?? 1;
  return {
    characterId: (humanPlayer?.characterId as string) ?? '',
    turnPhase: (G.turnPhase as string) ?? '',
    isHumanTurn: isMyTurn,
    isAlive: !!humanPlayer?.isAlive,
    humanLayer,
    masterLayer,
    hasPending,
    skillUsedThisTurn: humanPlayer?.skillUsedThisTurn ?? {},
    hand,
    faction: humanFaction === 'master' ? 'master' : 'thief',
    hasBribe:
      typeof humanPlayer?.bribeReceived === 'number' && (humanPlayer.bribeReceived as number) > 0,
    successfulUnlocksThisTurn:
      typeof humanPlayer?.successfulUnlocksThisTurn === 'number'
        ? (humanPlayer.successfulUnlocksThisTurn as number)
        : 0,
    bribePoolAvailable: Array.isArray(G.bribePool)
      ? G.bribePool.some((b) => b.status === 'inPool')
      : false,
    sameLayerPlayerIds: players
      ? Object.entries(players)
          .filter(([pid, p]) => pid !== seat && !!p.isAlive && p.currentLayer === humanLayer)
          .map(([pid]) => pid)
      : [],
    discardPile: Array.isArray(G.deck?.discardPile) ? G.deck.discardPile : [],
    bribePoolItems: Array.isArray(G.bribePool)
      ? G.bribePool
          .map((b, i) => ({ index: i, id: b.id, status: b.status }))
          .filter((b) => b.status === 'inPool')
          .map(({ index, id }) => ({ index, id }))
      : [],
    marsBattlefieldActive:
      !!players && !!dreamMasterID && players[dreamMasterID]?.characterId === 'dm_mars_battlefield',
  };
}

/** 主动技能目标列表：除本人外的存活玩家 */
export function activeSkillTargetIds(
  players: MatchView['players'] | undefined,
  seat: string | null,
): string[] {
  return players
    ? Object.entries(players)
        .filter(([pid, p]) => pid !== seat && !!p.isAlive)
        .map(([pid]) => pid)
    : [];
}

/** 座位到昵称的映射；没有昵称时用座位号 */
export function nicknameMap(players: MatchView['players'] | undefined): Record<string, string> {
  return players
    ? Object.fromEntries(
        Object.entries(players).map(([pid, p]) => [pid, (p.nickname as string) ?? pid]),
      )
    : {};
}

// ---------------------------------------------------------------------------
// 层与玩家的展示数据
// ---------------------------------------------------------------------------

/** 层级总览（LayerMap）所需的每层数据 */
export function buildLayerViews(
  G: Pick<MatchView, 'layers' | 'vaults'> | undefined,
): LayerMapProps['layers'] {
  const layersRaw = G?.layers;
  const vaultsRaw = G?.vaults;
  if (!layersRaw) return [];
  return Object.values(layersRaw).map((l) => ({
    layer: l.layer as number,
    heartLockValue: (l.heartLockValue as number) ?? 0,
    vaultCount:
      vaultsRaw?.filter((v) => (v.layer as number) === (l.layer as number) && !v.isOpened).length ??
      0,
    openedVaults:
      vaultsRaw
        ?.filter((v) => (v.layer as number) === (l.layer as number) && v.isOpened)
        .map((v) => ({
          contentType: v.contentType as 'secret' | 'coin' | 'empty',
        })) ?? [],
    nightmareRevealed: !!l.nightmareRevealed,
    nightmareCardId: l.nightmareId ?? null,
    playerIds: l.playersInLayer ?? [],
  }));
}

/** 层级总览（LayerMap）所需的玩家表 */
export function buildPlayerViews(
  players: MatchView['players'] | undefined,
): LayerMapProps['players'] {
  if (!players) return {};
  return Object.fromEntries(
    Object.entries(players).map(([id, p]) => [
      id,
      {
        id,
        nickname: (p.nickname as string) ?? id,
        faction: (p.faction as string) ?? 'thief',
        currentLayer: (p.currentLayer as number) ?? 1,
        isAlive: !!p.isAlive,
      },
    ]),
  );
}

export interface PlayerRowsInput {
  readonly mySeat: string | null;
  readonly currentSeat: string;
  readonly seatById: ReadonlyMap<string, SeatInfo>;
}

/** 玩家明细列表的每行数据；视图里没有玩家返回 null */
export function buildPlayerRows(
  G: Pick<MatchView, 'players' | 'dreamMasterID'> | undefined,
  input: PlayerRowsInput,
): PlayerRow[] | null {
  const players = G?.players;
  if (!players) return null;
  const dreamMasterID = G?.dreamMasterID ?? '';
  return Object.entries(players).map(([id, p]) => {
    const seatInfo = input.seatById.get(id);
    return {
      id,
      characterId: typeof p.characterId === 'string' ? p.characterId : '',
      isMaster: id === dreamMasterID,
      isCurrent: id === input.currentSeat,
      isSelf: id === input.mySeat,
      otherName: seatInfo?.isBot === false ? seatInfo.nickname || id : `AI ${id}`,
      markers: seatMarkers(seatInfo),
      faction: String(p.faction),
      layer: p.currentLayer,
      isAlive: !!p.isAlive,
      handCount: (p.handCount as number | undefined) ?? 0,
    };
  });
}

/** 万有引力池挑选：轮到谁挑；池不存在或顺序为空时回退到 fallback */
export function gravityCurrentPicker(
  pending: { pickOrder: readonly string[]; pickCursor: number } | null | undefined,
  fallback: string,
): string {
  return (
    pending?.pickOrder?.[
      (pending?.pickCursor ?? 0) % Math.max(1, pending?.pickOrder?.length ?? 1)
    ] ?? fallback
  );
}
