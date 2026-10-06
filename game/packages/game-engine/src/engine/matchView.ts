// 对局视图：服务端发给每个观察者的对局状态，白名单式
//
// 不对状态做展开再覆盖几个字段，而是逐字段显式构造视图对象。
// 状态里以后新增的字段，默认不会出现在视图里；要让它出现，必须在 MatchView 里写出来，
// 并在下面的 FIELD_DISPOSITION 里登记（编译器会逼着登记）。
//
// 约定：
//   - 对该观察者保密的值，视图里一律是 null；
//   - 观察者 viewer 是对局里的玩家 id，或 null（旁观者）；不在对局里的字符串按旁观者处理；
//   - 对局结束（options.gameOver）后全部公开，但随机种子和牌库顺序任何时候都不给；
//   - 随机种子（rngSeed）与内部计数器（moveCounter）不进视图。
//
// 对照：docs/manual/03-game-flow.md 贿赂（成败只有持有者知道）、docs/manual/06-dream-master.md 皇城、
//       docs/manual/04-action-cards.md 梦境窥视 / 天秤、docs/manual/08-appendix.md 背叛者的阵营在结束前不公开

import type { CardID, Faction, Layer } from '@icgame/shared';
import type { BribeSetup, LayerSetup, PlayerSetup, SetupState, VaultSetup } from '../setup.js';
import type { ResponseWindowState } from './abilities/response-chain.js';
import type { ResponseWindowSourceType } from './abilities/types.js';
import type { MatchOutcome } from './outcome.js';

/** 观察者：对局里的玩家，或旁观者（null） */
export type Viewer = string | null;

export interface MatchViewOptions {
  /** 对局是否已结束；结束后全部公开 */
  gameOver: boolean;
  /** 对局结果；不给时用状态里的同名字段 */
  outcome?: MatchOutcome;
}

// ---------------------------------------------------------------------------
// 视图类型：每个字段显式写出，没有索引签名，也不从状态类型派生
// ---------------------------------------------------------------------------

export interface PlayerView {
  id: string;
  nickname: string;
  avatarSeed: number;
  type: 'human' | 'bot';
  /** 未翻开的他人一律显示为盗梦者，即使真实阵营已因贿赂改变 */
  faction: Faction;
  /** 未翻开的他人为 null */
  characterId: CardID | null;
  isRevealed: boolean;
  currentLayer: Layer;
  isAlive: boolean;
  deathTurn: number | null;
  /** 进入迷失层之前所在的层；能从公开的移动推出，与 deathTurn 同样公开 */
  layerBeforeLimbo: Layer | null;
  /** 皇城世界观下尚未用掉的 SHOOT 机会；来自公开的收贿与发动，与 bribeReceived 同样公开 */
  imperialShootCharges: number;
  unlockCount: number;
  shootCount: number;
  bribeReceived: number;
  successfulUnlocksThisTurn: number;
  handCount: number;
  /** 只有本人（和对局结束后）看到牌；别人为 null */
  hand: CardID[] | null;
  skillUsedThisTurn: Record<string, number> | null;
  skillUsedThisGame: Record<string, number> | null;
  /** 预设的强制弃牌标记；与技能记录同等对待，只有本人可见 */
  forcedDiscardArmedAtTurn: number | null;
}

export interface LayerView {
  layer: Layer;
  heartLockValue: number;
  playersInLayer: string[];
  nightmareRevealed: boolean;
  nightmareTriggered: boolean;
  /** 未翻开时只有梦主（和对局结束后）看到；白羊选择发动或弃掉期间，被击杀者所在层的梦魇也给白羊本人 */
  nightmareId: CardID | null;
}

export interface VaultView {
  id: string;
  layer: Layer;
  isOpened: boolean;
  openedBy: string | null;
  /** 已开：所有人；未开：梦主、正在看这一层的看牌者；其余为 null */
  contentType: VaultSetup['contentType'] | null;
}

export interface BribeView {
  id: string;
  /** 不区分成败：只表达在池里还是已经派出 */
  status: 'inPool' | 'dispatched';
  heldBy: string | null;
  /** 成败：持有者看自己持有的、「皇城」梦主看池里的、窥视中的梦主看被看者持有的；其余为 null */
  kind: BribeSetup['kind'] | null;
}

export interface DeckView {
  cardCount: number;
  discardPile: CardID[];
}

export interface ResponseWindowView {
  sourceAbilityID: string;
  sourceType: ResponseWindowSourceType | null;
  responders: string[];
  responded: string[];
  timeoutMs: number;
  validResponseAbilityIDs: string[];
  onTimeout: 'resolve' | 'cancel';
  parentWindow: ResponseWindowView | null;
}

export interface PendingUnlockView {
  playerID: string;
  layer: number;
  cardId: CardID;
}

export interface PendingGraftView {
  playerID: string;
}

export interface PendingResonanceView {
  bonderPlayerID: string;
  targetPlayerID: string;
}

export interface PendingGravityView {
  bonderPlayerID: string;
  targetIds: string[];
  pool: CardID[];
  pickOrder: string[];
  pickCursor: number;
}

export interface PendingPeekDecisionView {
  peekerID: string;
  targetLayer: number;
}

/** 金币金库打开后等梦主三选一：只有层与打开者，不带任何梦魇或贿赂内容 */
export interface PendingVaultDecisionView {
  layer: number;
  openerID: string;
}

export type PeekRevealView =
  | { peekerID: string; revealKind: 'vault'; vaultLayer: number }
  | { peekerID: string; revealKind: 'bribe'; targetThiefID: string };

export interface PendingLibraView {
  bonderPlayerID: string;
  targetPlayerID: string;
  /** 还没分牌时为 null；分了牌后两堆的内容只有发动者和被要求分牌的人看到 */
  split: {
    pile1: CardID[] | null;
    pile2: CardID[] | null;
    pile1Count: number;
    pile2Count: number;
  } | null;
}

export interface PendingSudgerRollsView {
  rollA: number;
  rollB: number;
  targetPlayerID: string;
  cardId: CardID;
  deathFaces: number[];
  moveFaces: number[];
  extraOnMove: 'discard_unlocks' | 'discard_shoots' | null;
}

export interface PendingShootMoveView {
  shooterID: string;
  targetPlayerID: string;
  cardId: CardID;
  extraOnMove: 'discard_unlocks' | 'discard_shoots' | null;
  choices: number[];
}

export interface MazeStateView {
  mazedPlayerID: string;
  untilTurnNumber: number;
}

export interface PendingAriesChoiceView {
  /** 白羊是谁会暴露角色，只有白羊本人（和对局结束后）可见 */
  ariesID: string | null;
  victimLayer: number;
  victimID: string;
}

export interface PendingVirgoChoiceView {
  /** 处女是谁会暴露角色，只有处女本人（和对局结束后）可见 */
  virgoID: string | null;
  triggerRoll: number;
  shooterID: string;
}

export interface PendingShootResponseView {
  shooterID: string;
  targetPlayerID: string;
  cardId: CardID;
  sameLayerRequired: boolean;
  deathFaces: number[];
  moveFaces: number[];
  extraOnMove: 'discard_unlocks' | 'discard_shoots' | null;
  decreeId: CardID | null;
  preventMove: boolean;
  /** 响应类型会暴露目标的角色，只有目标本人（和对局结束后）可见 */
  responseType: 'pisces' | 'terrorist' | null;
}

/** 某个观察者能看到的对局状态。字段是白名单：这里没有的，观察者就看不到 */
export interface MatchView {
  /** 对局是否已结束（此时 null 只表示「本来就没有」，不再表示「看不到」） */
  gameOver: boolean;

  matchId: string;
  schemaVersion: number;
  phase: SetupState['phase'];
  turnPhase: SetupState['turnPhase'];
  turnNumber: number;
  playerOrder: string[];
  currentPlayerID: string;
  dreamMasterID: string;
  ruleVariant: string;
  exCardsEnabled: boolean;
  expansionEnabled: boolean;

  players: Record<string, PlayerView>;
  layers: Record<number, LayerView>;
  vaults: VaultView[];
  bribePool: BribeView[];
  deck: DeckView;

  unlockThisTurn: number;
  maxUnlockPerTurn: number;
  /** 梦主（和对局结束后）看到全部；别人为 null，只有下面的数量 */
  usedNightmareIds: CardID[] | null;
  usedNightmareCount: number;
  activeWorldViews: CardID[];

  pendingUnlock: PendingUnlockView | null;
  pendingGraft: PendingGraftView | null;
  pendingResonance: PendingResonanceView | null;
  pendingGravity: PendingGravityView | null;
  /** 只保留已翻开玩家和本人的条目 */
  shiftSnapshot: Record<string, CardID> | null;
  pendingResponseWindow: ResponseWindowView | null;
  pendingPeekDecision: PendingPeekDecisionView | null;
  pendingVaultDecision: PendingVaultDecisionView | null;
  peekReveal: PeekRevealView | null;
  pendingLibra: PendingLibraView | null;
  pendingSudgerRolls: PendingSudgerRollsView | null;
  pendingShootMove: PendingShootMoveView | null;
  mazeState: MazeStateView | null;
  pendingAriesChoice: PendingAriesChoiceView | null;
  pendingVirgoChoice: PendingVirgoChoiceView | null;
  pendingShootResponse: PendingShootResponseView | null;

  winner: Faction | null;
  winReason: string | null;
  endTurn: number | null;

  playedCardsThisTurn: CardID[];
  lastPlayedCardThisTurn: CardID | null;
  lastShootRoll: number | null;
  removedFromGame: CardID[];
}

// ---------------------------------------------------------------------------
// 字段处置表：状态里每个字段必须登记一次，新增字段时编译器会报错
//   public      所有观察者看到的内容相同（可能经过归并，例如牌库只给张数）
//   conditional 内容随观察者而变
//   withheld    不进视图
// ---------------------------------------------------------------------------

export type Disposition = 'public' | 'conditional' | 'withheld';

export const FIELD_DISPOSITION: Record<keyof SetupState, Disposition> = {
  matchId: 'public',
  schemaVersion: 'public',
  rngSeed: 'withheld',
  phase: 'public',
  turnPhase: 'public',
  turnNumber: 'public',
  players: 'conditional',
  playerOrder: 'public',
  currentPlayerID: 'public',
  dreamMasterID: 'public',
  ruleVariant: 'public',
  exCardsEnabled: 'public',
  expansionEnabled: 'public',
  layers: 'conditional',
  vaults: 'conditional',
  bribePool: 'conditional',
  deck: 'public',
  unlockThisTurn: 'public',
  maxUnlockPerTurn: 'public',
  usedNightmareIds: 'conditional',
  moveCounter: 'withheld',
  activeWorldViews: 'public',
  pendingUnlock: 'public',
  pendingGraft: 'public',
  pendingResonance: 'public',
  pendingGravity: 'public',
  shiftSnapshot: 'conditional',
  pendingResponseWindow: 'public',
  pendingPeekDecision: 'public',
  pendingVaultDecision: 'public',
  peekReveal: 'public',
  pendingLibra: 'conditional',
  pendingSudgerRolls: 'public',
  pendingShootMove: 'public',
  mazeState: 'public',
  pendingAriesChoice: 'conditional',
  pendingVirgoChoice: 'conditional',
  pendingShootResponse: 'conditional',
  winner: 'public',
  winReason: 'public',
  endTurn: 'public',
  playedCardsThisTurn: 'public',
  lastPlayedCardThisTurn: 'public',
  lastShootRoll: 'public',
  removedFromGame: 'public',
};

export const PLAYER_FIELD_DISPOSITION: Record<keyof PlayerSetup, Disposition> = {
  id: 'public',
  nickname: 'public',
  avatarSeed: 'public',
  type: 'public',
  botLevel: 'withheld',
  faction: 'conditional',
  characterId: 'conditional',
  isRevealed: 'public',
  currentLayer: 'public',
  hand: 'conditional',
  isAlive: 'public',
  deathTurn: 'public',
  layerBeforeLimbo: 'public',
  imperialShootCharges: 'public',
  unlockCount: 'public',
  shootCount: 'public',
  bribeReceived: 'public',
  skillUsedThisTurn: 'conditional',
  skillUsedThisGame: 'conditional',
  successfulUnlocksThisTurn: 'public',
  forcedDiscardArmedAtTurn: 'conditional',
};

export const LAYER_FIELD_DISPOSITION: Record<keyof LayerSetup, Disposition> = {
  layer: 'public',
  dreamCardId: 'withheld',
  nightmareId: 'conditional',
  nightmareRevealed: 'public',
  nightmareTriggered: 'public',
  playersInLayer: 'public',
  heartLockValue: 'public',
};

export const VAULT_FIELD_DISPOSITION: Record<keyof VaultSetup, Disposition> = {
  id: 'public',
  layer: 'public',
  contentType: 'conditional',
  isOpened: 'public',
  openedBy: 'public',
};

export const BRIBE_FIELD_DISPOSITION: Record<keyof BribeSetup, Disposition> = {
  id: 'public',
  kind: 'conditional',
  status: 'public',
  heldBy: 'public',
  originalOwnerId: 'withheld',
};

// ---------------------------------------------------------------------------
// 观察者上下文
// ---------------------------------------------------------------------------

/** 皇城梦主的角色编号：可以随时查看池中未派出的贿赂牌。docs/manual/06-dream-master.md 皇城 */
const IMPERIAL_CITY_MASTER = 'dm_imperial_city';

interface Audience {
  /** 对局里的观察者 id；旁观者与不在对局里的字符串都是 null */
  who: string | null;
  isMaster: boolean;
  /** 对局已结束：全部公开 */
  open: boolean;
}

function audienceOf(G: SetupState, viewer: Viewer, options: MatchViewOptions): Audience {
  const who = typeof viewer === 'string' && Object.hasOwn(G.players, viewer) ? viewer : null;
  return {
    who,
    isMaster: who !== null && who === G.dreamMasterID,
    open: options.gameOver === true,
  };
}

function entries<T, V>(source: Record<string, T>, build: (key: string, value: T) => V) {
  return Object.fromEntries(Object.keys(source).map((key) => [key, build(key, source[key]!)]));
}

// ---------------------------------------------------------------------------
// 逐部分构造
// ---------------------------------------------------------------------------

function viewPlayer(id: string, p: PlayerSetup, who: Audience): PlayerView {
  const mine = who.who === id;
  const identityKnown = who.open || mine || p.isRevealed;
  const own = who.open || mine;
  return {
    id: p.id,
    nickname: p.nickname,
    avatarSeed: p.avatarSeed,
    type: p.type,
    faction: identityKnown ? p.faction : 'thief',
    characterId: identityKnown ? p.characterId : null,
    isRevealed: p.isRevealed,
    currentLayer: p.currentLayer,
    isAlive: p.isAlive,
    deathTurn: p.deathTurn,
    layerBeforeLimbo: p.layerBeforeLimbo ?? null,
    imperialShootCharges: p.imperialShootCharges ?? 0,
    unlockCount: p.unlockCount,
    shootCount: p.shootCount,
    bribeReceived: p.bribeReceived,
    successfulUnlocksThisTurn: p.successfulUnlocksThisTurn,
    handCount: p.hand.length,
    hand: own ? p.hand.slice() : null,
    skillUsedThisTurn: own ? Object.fromEntries(Object.entries(p.skillUsedThisTurn)) : null,
    skillUsedThisGame: own ? Object.fromEntries(Object.entries(p.skillUsedThisGame)) : null,
    forcedDiscardArmedAtTurn: own ? (p.forcedDiscardArmedAtTurn ?? null) : null,
  };
}

function viewLayer(l: LayerSetup, who: Audience, G: SetupState): LayerView {
  // 白羊·星尘：白羊翻开被击杀者所在层的梦魇后才选择发动或弃掉，所以选择期间只对白羊本人给出这一层的梦魇
  // 对照：docs/manual/05-dream-thieves.md 白羊「星尘」
  const aries = G.pendingAriesChoice;
  const ariesSees =
    aries !== null &&
    who.who !== null &&
    who.who === aries.ariesID &&
    aries.victimLayer === l.layer;
  const nightmareKnown = who.open || who.isMaster || l.nightmareRevealed || ariesSees;
  return {
    layer: l.layer,
    heartLockValue: l.heartLockValue,
    playersInLayer: l.playersInLayer.slice(),
    nightmareRevealed: l.nightmareRevealed,
    nightmareTriggered: l.nightmareTriggered,
    nightmareId: nightmareKnown ? l.nightmareId : null,
  };
}

function viewVault(v: VaultSetup, G: SetupState, who: Audience): VaultView {
  const peek = G.peekReveal;
  // 梦境窥视效果①：看牌者只能看到被看的那一层
  const peeking =
    who.who !== null &&
    peek !== null &&
    peek.revealKind === 'vault' &&
    peek.peekerID === who.who &&
    peek.vaultLayer === v.layer;
  const known = who.open || v.isOpened || who.isMaster || peeking;
  return {
    id: v.id,
    layer: v.layer,
    isOpened: v.isOpened,
    openedBy: v.openedBy,
    contentType: known ? v.contentType : null,
  };
}

function viewBribe(b: BribeSetup, G: SetupState, who: Audience): BribeView {
  const dispatched = b.status !== 'inPool';
  const holds = who.who !== null && dispatched && b.heldBy === who.who;
  // 皇城梦主可以随时查看池里未派出的牌，但看不到已经派出的
  const imperialSeesPool =
    who.isMaster &&
    who.who !== null &&
    G.players[who.who]!.characterId === IMPERIAL_CITY_MASTER &&
    !dispatched;
  // 梦境窥视效果②：梦主查看被指定的盗梦者持有的牌
  const peek = G.peekReveal;
  const peeksHeld =
    who.isMaster &&
    peek !== null &&
    peek.revealKind === 'bribe' &&
    peek.peekerID === who.who &&
    dispatched &&
    b.heldBy === peek.targetThiefID;
  const known = who.open || holds || imperialSeesPool || peeksHeld;
  return {
    id: b.id,
    status: dispatched ? 'dispatched' : 'inPool',
    heldBy: b.heldBy,
    kind: known ? b.kind : null,
  };
}

function viewWindow(w: ResponseWindowState): ResponseWindowView {
  return {
    sourceAbilityID: w.sourceAbilityID,
    sourceType: w.sourceType ?? null,
    responders: w.responders.slice(),
    responded: w.responded.slice(),
    timeoutMs: w.timeoutMs,
    validResponseAbilityIDs: w.validResponseAbilityIDs.slice(),
    onTimeout: w.onTimeout,
    parentWindow: w.parentWindow ? viewWindow(w.parentWindow) : null,
  };
}

function viewPeekReveal(r: NonNullable<SetupState['peekReveal']>): PeekRevealView {
  if (r.revealKind === 'vault') {
    return { peekerID: r.peekerID, revealKind: 'vault', vaultLayer: r.vaultLayer };
  }
  return { peekerID: r.peekerID, revealKind: 'bribe', targetThiefID: r.targetThiefID };
}

function viewLibra(l: NonNullable<SetupState['pendingLibra']>, who: Audience): PendingLibraView {
  const sees =
    who.open ||
    (who.who !== null && (who.who === l.bonderPlayerID || who.who === l.targetPlayerID));
  const split = l.split;
  return {
    bonderPlayerID: l.bonderPlayerID,
    targetPlayerID: l.targetPlayerID,
    split: split
      ? {
          pile1: sees ? split.pile1.slice() : null,
          pile2: sees ? split.pile2.slice() : null,
          pile1Count: split.pile1.length,
          pile2Count: split.pile2.length,
        }
      : null,
  };
}

function viewShiftSnapshot(
  snapshot: NonNullable<SetupState['shiftSnapshot']>,
  G: SetupState,
  who: Audience,
): Record<string, CardID> {
  // 已翻开玩家的条目记着他换牌前的角色；该角色此刻若落在一个未翻开的别人身上，
  // 带着这条就等于告诉观察者那人的角色，所以这种条目只给本人和对局结束后的视图
  const heldHiddenByOther = (character: CardID): boolean =>
    Object.values(G.players).some(
      (p) => p.characterId === character && !p.isRevealed && p.id !== who.who,
    );
  const kept = Object.keys(snapshot).filter(
    (id) =>
      who.open ||
      who.who === id ||
      (G.players[id]?.isRevealed === true && !heldHiddenByOther(snapshot[id]!)),
  );
  return Object.fromEntries(kept.map((id) => [id, snapshot[id]!]));
}

function viewUsedNightmares(G: SetupState, who: Audience): CardID[] | null {
  return who.open || who.isMaster ? G.usedNightmareIds.slice() : null;
}

function viewShootResponse(
  r: NonNullable<SetupState['pendingShootResponse']>,
  who: Audience,
): PendingShootResponseView {
  const responder = who.open || (who.who !== null && who.who === r.targetPlayerID);
  return {
    shooterID: r.shooterID,
    targetPlayerID: r.targetPlayerID,
    cardId: r.cardId,
    sameLayerRequired: r.sameLayerRequired,
    deathFaces: r.deathFaces.slice(),
    moveFaces: r.moveFaces.slice(),
    extraOnMove: r.extraOnMove,
    decreeId: r.decreeId ?? null,
    preventMove: r.preventMove ?? false,
    responseType: responder ? (r.responseType ?? 'pisces') : null,
  };
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function viewFor(G: SetupState, viewer: Viewer, options: MatchViewOptions): MatchView {
  const who = audienceOf(G, viewer, options);
  const pendingUnlock = G.pendingUnlock;
  const pendingGraft = G.pendingGraft;
  const pendingResonance = G.pendingResonance;
  const pendingGravity = G.pendingGravity;
  const pendingPeekDecision = G.pendingPeekDecision;
  const pendingVaultDecision = G.pendingVaultDecision;
  const sudger = G.pendingSudgerRolls ?? null;
  const shootMove = G.pendingShootMove ?? null;
  const maze = G.mazeState;
  const aries = G.pendingAriesChoice;
  const virgo = G.pendingVirgoChoice;
  const shootResponse = G.pendingShootResponse ?? null;

  return {
    gameOver: who.open,

    matchId: G.matchId,
    schemaVersion: G.schemaVersion,
    phase: G.phase,
    turnPhase: G.turnPhase,
    turnNumber: G.turnNumber,
    playerOrder: G.playerOrder.slice(),
    currentPlayerID: G.currentPlayerID,
    dreamMasterID: G.dreamMasterID,
    ruleVariant: G.ruleVariant,
    exCardsEnabled: G.exCardsEnabled,
    expansionEnabled: G.expansionEnabled,

    players: entries(G.players, (id, p) => viewPlayer(id, p, who)),
    layers: entries(G.layers as Record<string, LayerSetup>, (_key, l) => viewLayer(l, who, G)),
    vaults: G.vaults.map((v) => viewVault(v, G, who)),
    bribePool: G.bribePool.map((b) => viewBribe(b, G, who)),
    deck: { cardCount: G.deck.cards.length, discardPile: G.deck.discardPile.slice() },

    unlockThisTurn: G.unlockThisTurn,
    maxUnlockPerTurn: G.maxUnlockPerTurn,
    usedNightmareIds: viewUsedNightmares(G, who),
    usedNightmareCount: G.usedNightmareIds.length,
    activeWorldViews: G.activeWorldViews.slice(),

    pendingUnlock: pendingUnlock
      ? {
          playerID: pendingUnlock.playerID,
          layer: pendingUnlock.layer,
          cardId: pendingUnlock.cardId,
        }
      : null,
    pendingGraft: pendingGraft ? { playerID: pendingGraft.playerID } : null,
    pendingResonance: pendingResonance
      ? {
          bonderPlayerID: pendingResonance.bonderPlayerID,
          targetPlayerID: pendingResonance.targetPlayerID,
        }
      : null,
    pendingGravity: pendingGravity
      ? {
          bonderPlayerID: pendingGravity.bonderPlayerID,
          targetIds: pendingGravity.targetIds.slice(),
          pool: pendingGravity.pool.slice(),
          pickOrder: pendingGravity.pickOrder.slice(),
          pickCursor: pendingGravity.pickCursor,
        }
      : null,
    shiftSnapshot: G.shiftSnapshot ? viewShiftSnapshot(G.shiftSnapshot, G, who) : null,
    pendingResponseWindow: G.pendingResponseWindow ? viewWindow(G.pendingResponseWindow) : null,
    pendingPeekDecision: pendingPeekDecision
      ? { peekerID: pendingPeekDecision.peekerID, targetLayer: pendingPeekDecision.targetLayer }
      : null,
    pendingVaultDecision: pendingVaultDecision
      ? { layer: pendingVaultDecision.layer, openerID: pendingVaultDecision.openerID }
      : null,
    peekReveal: G.peekReveal ? viewPeekReveal(G.peekReveal) : null,
    pendingLibra: G.pendingLibra ? viewLibra(G.pendingLibra, who) : null,
    pendingSudgerRolls: sudger
      ? {
          rollA: sudger.rollA,
          rollB: sudger.rollB,
          targetPlayerID: sudger.targetPlayerID,
          cardId: sudger.cardId,
          deathFaces: sudger.deathFaces.slice(),
          moveFaces: sudger.moveFaces.slice(),
          extraOnMove: sudger.extraOnMove,
        }
      : null,
    pendingShootMove: shootMove
      ? {
          shooterID: shootMove.shooterID,
          targetPlayerID: shootMove.targetPlayerID,
          cardId: shootMove.cardId,
          extraOnMove: shootMove.extraOnMove,
          choices: shootMove.choices.slice(),
        }
      : null,
    mazeState: maze
      ? { mazedPlayerID: maze.mazedPlayerID, untilTurnNumber: maze.untilTurnNumber }
      : null,
    // 这里遮住的行动者，必须与 matchEvents.ts 的 MASKED_ACTOR_FIELDS 保持一致
    pendingAriesChoice: aries
      ? {
          ariesID: who.open || who.who === aries.ariesID ? aries.ariesID : null,
          victimLayer: aries.victimLayer,
          victimID: aries.victimID,
        }
      : null,
    pendingVirgoChoice: virgo
      ? {
          virgoID: who.open || who.who === virgo.virgoID ? virgo.virgoID : null,
          triggerRoll: virgo.triggerRoll,
          shooterID: virgo.shooterID,
        }
      : null,
    pendingShootResponse: shootResponse ? viewShootResponse(shootResponse, who) : null,

    winner: options.outcome ? options.outcome.winner : G.winner,
    winReason: options.outcome ? options.outcome.reason : G.winReason,
    endTurn: G.endTurn,

    playedCardsThisTurn: G.playedCardsThisTurn.slice(),
    lastPlayedCardThisTurn: G.lastPlayedCardThisTurn,
    lastShootRoll: G.lastShootRoll,
    removedFromGame: G.removedFromGame.slice(),
  };
}
