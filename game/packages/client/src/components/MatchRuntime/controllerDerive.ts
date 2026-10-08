// 对局界面控制层的纯推导：不依赖 React，输入是按座位裁剪过的视图，输出是界面要用的数据与参数。
// useMatchController 只负责把这些函数接到状态与回调上。

import { isShootClassCard } from '@icgame/game-engine';
import type { MatchView, MatchViewState, PlayerView, RunnerCtx } from '@icgame/game-engine';
import { actionMoveFor, getCardName, type PlayRole } from '../../lib/cards';
import { getCardImageUrl } from '../../lib/cardImages';
import type { ActiveSkillContext, SkillLayerInfo, SkillPlayerInfo } from '../../lib/activeSkills';
import { unlockLimitExhausted } from '../../lib/unlockLimit';
import { peekMasterTargetIds } from '../TargetPlayerPickerDialog/logic';
import type { HandCardItem, HandCardMode, PendingPlay } from './controllerTypes';
import { REVIVED_SELF_KEY } from './model/dockEntries';
import {
  DEFAULT_PLAY_RULES,
  playBlockReason,
  type PlayBlockReason,
  type PlayRuleContext,
} from './model/handDerive';

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
  /** 引擎必拒的几种出牌（已在迷失层、梦主的解封等）要用的信息；不给按存活的盗梦者处理 */
  readonly rules?: PlayRuleContext;
}

/**
 * 从按座位裁剪的视图推导出牌规则所需的信息：身份（是不是梦主）、是否存活、本回合有没有复活过自己、
 * 梦主的梦境窥视有没有可选目标（贿赂池里的 heldBy 是公开的）。
 */
export function derivePlayRules(
  G:
    | Pick<MatchView, 'players' | 'dreamMasterID' | 'bribePool' | 'layers' | 'maxUnlockPerTurn'>
    | undefined,
  seat: string | null,
): PlayRuleContext {
  if (!G || seat === null) return DEFAULT_PLAY_RULES;
  const me = G.players?.[seat];
  const role: PlayRole = seat === G.dreamMasterID ? 'master' : 'thief';
  const myLayer = me ? G.layers?.[me.currentLayer as number] : undefined;
  return {
    role,
    alive: me ? !!me.isAlive : true,
    revivedSelfThisTurn: (me?.skillUsedThisTurn?.[REVIVED_SELF_KEY] ?? 0) > 0,
    hasPeekMasterTarget:
      role === 'master' &&
      peekMasterTargetIds(G.players ?? {}, G.dreamMasterID, seat, bribeHolderIds(G.bribePool))
        .length > 0,
    layerHeartLock: myLayer ? myLayer.heartLockValue : null,
    unlockExhausted:
      me && typeof G.maxUnlockPerTurn === 'number' ? unlockExhaustedFor(G, me) : false,
    hasNightmareUnlockTarget: nightmareUnlockLayers(G.layers).length > 0,
  };
}

/**
 * 【梦魇解封】能选的层：还盖着暗置梦魇的层。
 * 梦魇是什么只有梦主看得到，但「已翻开」「已发动 / 弃掉」两个标记是公开的，开局每层都有一张，
 * 所以「没翻开且没被清走」就等价于引擎要求的「这层有梦魇且未翻开」。
 * 对照：docs/manual/04-action-cards.md 梦魇解封；引擎的 playNightmareUnlock
 */
export function nightmareUnlockLayers(layers: MatchView['layers'] | undefined): number[] {
  return Object.entries(layers ?? {})
    .filter(([, l]) => !l.nightmareRevealed && !l.nightmareTriggered)
    .map(([layer]) => Number(layer))
    .filter((layer) => layer >= 1 && layer <= 4)
    .sort((a, b) => a - b);
}

/** 打出这张牌选目标层时可选的层；没有特别限制（交给弹层的默认推导）返回 null */
export function playLayerChoices(
  card: string,
  layers: MatchView['layers'] | undefined,
): number[] | null {
  return card === 'action_nightmare_unlock' ? nightmareUnlockLayers(layers) : null;
}

/** 持有贿赂牌的座位（不区分成败：视图里只公开谁持有） */
export function bribeHolderIds(bribePool: MatchView['bribePool'] | undefined): string[] {
  return [...new Set((bribePool ?? []).flatMap((b) => (b.heldBy ? [b.heldBy] : [])))];
}

/** 这张牌此刻被引擎拒绝的原因；只在行动阶段轮到本人时才有意义 */
function blockReasonFor(card: string, input: HandModeInput): PlayBlockReason | null {
  const { turnPhase, isMyTurn, winner } = input;
  if (turnPhase !== 'action' || !isMyTurn || winner) return null;
  const rules = input.rules ?? DEFAULT_PLAY_RULES;
  return actionMoveFor(card, rules.role) ? playBlockReason(card, rules) : null;
}

/**
 * 弃牌阶段此刻必须弃几张：直接取视图里的值，界面不自己算手牌上限。
 * 视图只在轮到本人弃牌时给出数字（巨蟹·庇佑之下是 0），其余时候为 null，按 0 处理。
 */
export function discardRequiredOf(G: Pick<MatchView, 'discardRequired'> | undefined): number {
  return G?.discardRequired ?? 0;
}

/** 一张手牌此刻的用途：弃牌阶段选牌 / 行动阶段可出 / 只读 */
export function handCardMode(card: string, input: HandModeInput): HandCardMode {
  const { turnPhase, isMyTurn, winner, overHand } = input;
  const isDiscardSelect = turnPhase === 'discard' && overHand > 0 && isMyTurn && !winner;
  if (isDiscardSelect) return 'discard';
  const role = input.rules?.role ?? 'thief';
  const isActionPlayable =
    turnPhase === 'action' &&
    isMyTurn &&
    !winner &&
    !!actionMoveFor(card, role) &&
    blockReasonFor(card, input) === null;
  return isActionPlayable ? 'play' : 'idle';
}

/**
 * 弃牌选择按手牌位置记录（同名牌各算一张）。
 * 只保留仍在手牌范围内、且此刻确实处于本人弃牌阶段的位置，去重，避免残留。
 */
export function effectiveDiscardSelection(
  selected: readonly number[],
  handSize: number,
  turnPhase: string,
  isMyTurn: boolean,
): number[] {
  if (turnPhase !== 'discard' || !isMyTurn) return [];
  return [...new Set(selected)].filter((i) => Number.isInteger(i) && i >= 0 && i < handSize);
}

/** 把选中的手牌位置换成发给对局的卡牌 ID 列表；越界的位置忽略 */
export function discardCardsFor(hand: readonly string[], selected: readonly number[]): string[] {
  return selected.flatMap((i) => (i >= 0 && i < hand.length ? [hand[i]!] : []));
}

export interface HandItemsInput extends HandModeInput {
  /** 已生效的弃牌选择：手牌位置（见 effectiveDiscardSelection） */
  readonly selectedDiscard: readonly number[];
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
      blockReason: mode === 'idle' ? blockReasonFor(card, input) : null,
      selected: mode === 'discard' && input.selectedDiscard.includes(index),
      pending: input.pendingCard === card,
    };
  });
}

/** 切换弃牌选择（按手牌位置）：已选则取消，未选则加入；不能超过需要弃的数量（超过时原样返回 prev） */
export function toggleDiscardSelection(
  prev: readonly number[],
  index: number,
  overHand: number,
): readonly number[] {
  const at = prev.indexOf(index);
  if (at >= 0) return prev.filter((_, i) => i !== at);
  if (prev.length >= overHand) return prev; // 不能超过要弃数量
  return [...prev, index];
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
export function pendingPlayFor(card: string, role: PlayRole = 'thief'): PendingPlay | null {
  const action = actionMoveFor(card, role);
  if (!action) return null;
  return {
    card,
    move: action.move,
    needsTarget: action.needsTarget,
    argOrder: action.argOrder,
  };
}

/** 「打出」一张牌之后要走的流程 */
export type CommitPlan =
  | { readonly kind: 'direct'; readonly pending: PendingPlay }
  | { readonly kind: 'target'; readonly pending: PendingPlay }
  | { readonly kind: 'dreamTransit' }
  | { readonly kind: 'gravity' };

/**
 * 确认打出一张牌：无目标的牌直接发 move，需要目标的牌进入选目标流程，
 * 梦境穿梭剂与万有引力各自进入专属选择器；这张牌不能在行动阶段打出则返回 null。
 */
export function commitPlanFor(card: string, role: PlayRole = 'thief'): CommitPlan | null {
  if (card === 'action_shoot_dream_transit') return { kind: 'dreamTransit' };
  if (card === 'action_gravity') return { kind: 'gravity' };
  const pending = pendingPlayFor(card, role);
  if (!pending) return null;
  return pending.needsTarget === 'none' ? { kind: 'direct', pending } : { kind: 'target', pending };
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
  'playShootSudger',
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

/** 意念判官的角色 id */
export const SUDGER_CHARACTER_ID = 'thief_sudger_of_mind';

/**
 * 角色技能改变出牌方式时，把出牌意图换成该角色要走的 move。
 * 意念判官【定罪】：使用 SHOOT 类牌时，目标改为掷 2 颗骰子，由判官选 1 颗做结果（docs/manual/05-dream-thieves.md）。
 * 说明书没有「可以」二字，是使用 SHOOT 类牌时一律改为这样结算，所以判官打出 SHOOT 类牌
 * 一律改走 playShootSudger（目标、牌、死亡宣言的参数顺序与普通 SHOOT 相同），选骰由随后的应答界面承担。
 * 梦境穿梭剂只有选了 SHOOT 模式才算 SHOOT 类，穿梭模式不受影响。
 */
export function adaptPlayForCharacter(
  pending: PendingPlay | null,
  characterId: string,
): PendingPlay | null {
  if (!pending || characterId !== SUDGER_CHARACTER_ID) return pending;
  // SHOOT 类牌以引擎的判定为准；其余牌仍走原来的 move
  if (!isShootClassCard(pending.card)) return pending;
  if (pending.dreamMode === 'shoot' && pending.move === 'playShootDreamTransit') {
    return {
      card: pending.card,
      move: 'playShootSudger',
      needsTarget: 'player',
      argOrder: 'target_first',
    };
  }
  if (isShootMove(pending.move) && pending.move !== 'playShootSudger') {
    return { ...pending, move: 'playShootSudger' };
  }
  return pending;
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
 * 射手·禁足（preventMove）是普通 SHOOT（playShoot）的末位参数：(目标, 牌, 宣言或空, true)。
 */
export function buildPlayArgs(
  pending: PendingPlay,
  target?: string | number,
  decree: string | null = null,
  preventMove = false,
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
  const withDecree = decree && isShootMove(pending.move) ? decree : null;
  if (preventMove && pending.move === 'playShoot') return [...args, withDecree ?? undefined, true];
  return withDecree ? [...args, withDecree] : args;
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
    !!G.pendingResponseWindow ||
    !!G.pendingShootResponse ||
    !!G.pendingShootMove;
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
    lostPlayerIds: activeSkillLostTargetIds(players, seat),
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
    skillUsedThisGame: humanPlayer?.skillUsedThisGame ?? {},
    unopenedVaults: Array.isArray(G.vaults) ? unopenedVaultCount(G.vaults) : 0,
    playedCards: Array.isArray(G.playedCardsThisTurn) ? G.playedCardsThisTurn : [],
    ...(seat !== null ? { seat } : {}),
    isDreamMaster: seat !== null && seat === dreamMasterID,
    dreamMasterID,
    ...(masterPlayer?.characterId ? { masterCharacterId: masterPlayer.characterId as string } : {}),
    players: skillPlayersOf(players),
    layers: skillLayersOf(G.layers),
    imperialShootCharges: humanPlayer?.imperialShootCharges ?? 0,
    deckCount: typeof G.deck?.cardCount === 'number' ? G.deck.cardCount : undefined,
    unlockExhausted: humanPlayer ? unlockExhaustedFor(G, humanPlayer) : false,
  };
}

/** 各玩家公开的、技能推导要用的信息 */
function skillPlayersOf(
  players: MatchView['players'] | undefined,
): Record<string, SkillPlayerInfo> {
  return Object.fromEntries(
    Object.entries(players ?? {}).map(([id, p]) => [
      id,
      {
        isAlive: !!p.isAlive,
        currentLayer: p.currentLayer as number,
        bribeReceived: p.bribeReceived ?? 0,
        handCount: p.handCount ?? 0,
      },
    ]),
  );
}

/** 各层公开的信息；梦魇是什么只有梦主（和已翻开时）看得到 */
function skillLayersOf(layers: MatchView['layers'] | undefined): Record<number, SkillLayerInfo> {
  return Object.fromEntries(
    Object.entries(layers ?? {}).map(([key, l]) => [
      Number(key),
      {
        heartLockValue: l.heartLockValue,
        nightmareRevealed: l.nightmareRevealed,
        nightmareTriggered: l.nightmareTriggered,
        nightmareId: l.nightmareId ?? null,
        playersInLayer: l.playersInLayer ?? [],
      },
    ]),
  );
}

/** 本人本回合的解封次数是否已用尽（摩羯·节奏 / 水瓶·同流豁免）；全部来自本人视图 */
export function unlockExhaustedFor(
  G: Pick<MatchView, 'maxUnlockPerTurn'>,
  me: Pick<
    PlayerView,
    | 'characterId'
    | 'isAlive'
    | 'currentLayer'
    | 'handCount'
    | 'hand'
    | 'successfulUnlocksThisTurn'
    | 'skillUsedThisTurn'
  >,
): boolean {
  return unlockLimitExhausted({
    characterId: me.characterId,
    isAlive: !!me.isAlive,
    currentLayer: me.currentLayer as number,
    handCount: me.hand?.length ?? me.handCount ?? 0,
    successfulUnlocksThisTurn: me.successfulUnlocksThisTurn ?? 0,
    skillUsedThisTurn: me.skillUsedThisTurn,
    maxUnlockPerTurn: G.maxUnlockPerTurn,
  });
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

/** 在迷失层的其他玩家：灵魂牧师·拯救这类「目标必须已死亡」的技能用 */
export function activeSkillLostTargetIds(
  players: MatchView['players'] | undefined,
  seat: string | null,
): string[] {
  return players
    ? Object.entries(players)
        .filter(([pid, p]) => pid !== seat && !p.isAlive)
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

// ---------------------------------------------------------------------------
// 棋局·易位弹窗
// ---------------------------------------------------------------------------

/** 棋局技能每局最多使用的次数（与引擎的每局限次一致） */
export const CHESS_MAX_USES = 2;
/** 棋局技能的登记号（视图里本人的 skillUsedThisGame 以它为键） */
export const CHESS_SKILL_ID = 'dm_chess.skill_0';

export interface ChessAvailabilityInput {
  readonly characterId: string;
  readonly isMyTurn: boolean;
  readonly turnPhase: string;
  readonly winner: string | null;
  /** 此刻有别的待处理事项（出牌意图、各类待结算）占着界面 */
  readonly busy: boolean;
  /** 本人这一局已用的次数；视图里看不到时按 0 */
  readonly usedThisGame: number;
  /** 还没打开的金库数量：不足 2 个就没有可交换的 */
  readonly unopenedVaults: number;
}

/** 棋局·易位此刻能否发动：本人是棋局梦主、行动阶段、次数没用完、至少有 2 个未开金库 */
export function chessAvailable(input: ChessAvailabilityInput): boolean {
  return (
    input.characterId === 'dm_chess' &&
    input.isMyTurn &&
    input.turnPhase === 'action' &&
    !input.winner &&
    !input.busy &&
    input.usedThisGame < CHESS_MAX_USES &&
    input.unopenedVaults >= 2
  );
}

/** 本回合对棋局弹窗做过的处理：关闭，或从技能入口主动打开 */
export interface ChessDialogChoice {
  readonly turn: number;
  readonly mode: 'dismissed' | 'shown';
}

/**
 * 棋局·易位弹窗是否打开。
 * 本回合还没处理过：自动弹出一次；关闭后本回合不再自动弹出；从技能入口主动打开后保持打开直到再次关闭或确认。
 * 记录的是别的回合时按「还没处理过」对待，所以换回合自动恢复。
 */
export function chessDialogOpen(
  available: boolean,
  turnNumber: number,
  choice: ChessDialogChoice | null,
): boolean {
  if (!available) return false;
  if (choice === null || choice.turn !== turnNumber) return true;
  return choice.mode === 'shown';
}

/** 未开启的金库数量 */
export function unopenedVaultCount(vaults: readonly { readonly isOpened?: unknown }[]): number {
  return vaults.filter((v) => !v.isOpened).length;
}
