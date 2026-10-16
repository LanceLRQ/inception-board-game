// 盗梦者技能 · 手牌与牌库：抽、交、换、弃
// 对照：docs/manual/05-dream-thieves.md

import type { SetupState, PlayerSetup } from '../../setup.js';
import { drawCards, movePlayerToLayer, discardCard, discardCards } from '../../stateOps.js';
import type { CardID, Layer } from '@icgame/shared';
import { canUseSkill, markSkillUsed } from './usage.js';
import { isOutwardThief } from './masterSkills.js';

// === 先锋 · 突袭 ===
// 对照：docs/manual/05-dream-thieves.md 先锋
// 抽牌阶段抽取的牌中含【梦境穿梭剂】则再从牌库顶抽 2 张

export const POINTMAN_SKILL_ID = 'thief_pointman.skill_0';

/** 先锋技能：检查抽到的牌是否含梦境穿梭剂 */
export function pointmanCheckDrawnCards(drawnCards: CardID[]): boolean {
  return drawnCards.some((c) => c === 'action_dream_transit');
}

/** 先锋技能：抽牌后触发，含穿梭剂则额外抽 2 张 */
export function applyPointmanAssault(
  state: SetupState,
  playerID: string,
  drawnCards: CardID[],
): SetupState {
  const player = state.players[playerID];
  if (!player || player.characterId !== 'thief_pointman') return state;
  if (!canUseSkill(player, POINTMAN_SKILL_ID, 'ownTurnOncePerTurn')) return state;

  if (!pointmanCheckDrawnCards(drawnCards)) return state;

  let s = markSkillUsed(state, playerID, POINTMAN_SKILL_ID);
  s = drawCards(s, playerID, 2);
  return s;
}

// === 狮子 · 王道 ===
// 对照：docs/manual/05-dream-thieves.md 狮子
// 抽牌阶段：从牌库顶额外抽 = 梦主手牌数；梦主无手牌则从弃牌堆中额外选取 1 张
// 次数：卡面没有「限一次」，不限次数（每个抽牌阶段触发一次）
//
// MVP 简化：弃牌堆挑选自动取顶 1 张（不进入 pending 中间态）

export const LEO_SKILL_ID = 'thief_leo.skill_0';

/** 狮子技能：抽牌后触发 */
export function applyLeoKingdom(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player || player.characterId !== 'thief_leo') return state;

  const masterID = state.dreamMasterID;
  const master = state.players[masterID];
  if (!master) return state;

  let s = state;
  const masterHandCount = master.hand.length;

  if (masterHandCount > 0) {
    // 从牌库顶额外抽 = 梦主手牌数
    s = drawCards(s, playerID, masterHandCount);
  } else if (s.deck.discardPile.length > 0) {
    // 梦主无手牌：从弃牌堆顶取 1 张（MVP 简化）
    const discardTop = s.deck.discardPile[s.deck.discardPile.length - 1]!;
    const newDiscard = s.deck.discardPile.slice(0, -1);
    const self = s.players[playerID]!;
    s = {
      ...s,
      deck: { ...s.deck, discardPile: newDiscard },
      players: {
        ...s.players,
        [playerID]: { ...self, hand: [...self.hand, discardTop] },
      },
    };
  }
  // 弃牌堆也无 → 无效果
  return s;
}

// === 药剂师 · 调剂 ===
// 对照：docs/manual/05-dream-thieves.md 药剂师
// 出牌阶段：弃 1 张手牌 → 弃牌堆中拿 1 张【梦境穿梭剂】到手牌。回合限 2 次。

export const CHEMIST_SKILL_ID = 'thief_chemist.skill_0';
const CHEMIST_LIMIT_PER_TURN = 2;

/** 药剂师技能 */
export function applyChemistRefine(
  state: SetupState,
  selfID: string,
  discardCardId: CardID,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_chemist') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, CHEMIST_SKILL_ID, 'ownTurnLimitN', CHEMIST_LIMIT_PER_TURN)) return null;

  // 弃牌必须在手中
  if (!player.hand.includes(discardCardId)) return null;

  // 弃牌堆必须含 action_dream_transit
  const transitIdx = state.deck.discardPile.lastIndexOf('action_dream_transit' as CardID);
  if (transitIdx === -1) return null;

  let s = markSkillUsed(state, selfID, CHEMIST_SKILL_ID);
  // 先付代价：从手中弃牌（弃的是时间风暴则触发效果；弃牌堆只会追加，原有下标不变）
  s = discardCard(s, selfID, discardCardId);
  // 取出梦境穿梭剂加入手牌
  const newDiscard = [...s.deck.discardPile];
  newDiscard.splice(transitIdx, 1);
  const self = s.players[selfID]!;
  s = {
    ...s,
    players: {
      ...s.players,
      [selfID]: { ...self, hand: [...self.hand, 'action_dream_transit' as CardID] },
    },
    deck: { ...s.deck, discardPile: newDiscard },
  };
  return s;
}

// === 药剂师 · 注射（skill_1）===
// 对照：docs/manual/05-dream-thieves.md 药剂师 278 行
// 出牌阶段：弃 1 张手牌中的梦境穿梭剂 → 令同层另一玩家移动到相邻层（应用穿梭剂效果）
// 规则：manual 未写回合限（无次数限制）；target 必须存活且非 self；穿梭剂只能移到相邻层

export const CHEMIST_INJECT_SKILL_ID = 'thief_chemist.skill_1';

export function applyChemistInject(
  state: SetupState,
  selfID: string,
  targetID: string,
  toLayer: Layer,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_chemist') return null;
  if (!player.isAlive) return null;
  if (player.currentLayer < 1) return null;
  if (selfID === targetID) return null;
  const target = state.players[targetID];
  if (!target || !target.isAlive) return null;
  if (target.currentLayer !== player.currentLayer) return null;
  // 目标层必须有效（1-4）
  if (toLayer < 1 || toLayer > 4) return null;
  // 穿梭剂只能移到相邻层（从 target 当前层出发）
  if (Math.abs(target.currentLayer - toLayer) !== 1) return null;
  // 手牌必须有 action_dream_transit
  if (!player.hand.includes('action_dream_transit' as CardID)) return null;

  // 弃穿梭剂
  let s = discardCard(state, selfID, 'action_dream_transit' as CardID);
  // target 移动
  s = movePlayerToLayer(s, targetID, toLayer);
  return s;
}

// === 战争之王 · 黑市 ===
// 对照：docs/manual/05-dream-thieves.md 战争之王
// 出牌阶段：弃 2 张手牌 → 弃牌堆任意 1 张到手牌。回合限 1 次。

export const LORD_OF_WAR_SKILL_ID = 'thief_lord_of_war.skill_0';

/** 战争之王技能 */
export function applyLordOfWarBlackMarket(
  state: SetupState,
  selfID: string,
  discardIds: readonly CardID[],
  pickFromDiscard: CardID,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_lord_of_war') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, LORD_OF_WAR_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  if (discardIds.length !== 2) return null;

  // 两张弃牌必须都在手中（允许重复，但需要两个独立 index）
  const newHand = [...player.hand];
  for (const cid of discardIds) {
    const idx = newHand.indexOf(cid);
    if (idx === -1) return null;
    newHand.splice(idx, 1);
  }

  // 弃牌堆必须含 pickFromDiscard
  const pickIdx = state.deck.discardPile.lastIndexOf(pickFromDiscard);
  if (pickIdx === -1) return null;

  let s = markSkillUsed(state, selfID, LORD_OF_WAR_SKILL_ID);
  // 先付代价：从手中弃 2 张（弃牌堆只会追加，原有下标不变）
  s = discardCards(s, selfID, discardIds);
  const newDiscard = [...s.deck.discardPile];
  newDiscard.splice(pickIdx, 1);
  const self = s.players[selfID]!;
  s = {
    ...s,
    players: { ...s.players, [selfID]: { ...self, hand: [...self.hand, pickFromDiscard] } },
    deck: { ...s.deck, discardPile: newDiscard },
  };
  return s;
}

// === 天秤 · 平衡（手牌分组拣选）===
// 对照：docs/manual/05-dream-thieves.md 天秤
// 出牌阶段：将所有手牌给 target → target 分两份 → self 选 1 份取走，余下归还 target。回合限 1 次。
//
// engine 纯函数：拆分为 split + pick 两步（move 接入 + pendingLibra 状态机待后续批次）

export const LIBRA_SKILL_ID = 'thief_libra.skill_0';

export interface LibraSplitResult {
  pile1: CardID[];
  pile2: CardID[];
}

/** 天秤 step 1：target 分组（合法性校验） */
export function libraValidateSplit(
  totalHand: readonly CardID[],
  pile1: readonly CardID[],
  pile2: readonly CardID[],
): boolean {
  if (pile1.length + pile2.length !== totalHand.length) return false;
  // 两份合并后必须等于 totalHand 的多重集（multiset）
  const expected = [...totalHand].sort();
  const actual = [...pile1, ...pile2].sort();
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) return false;
  }
  return true;
}

/** 天秤 step 2：self 选哪份（返回 self 收到的牌 + target 留下的牌） */
export function libraResolvePick(
  split: LibraSplitResult,
  pick: 'pile1' | 'pile2',
): { selfGets: CardID[]; targetGets: CardID[] } {
  if (pick === 'pile1') {
    return { selfGets: [...split.pile1], targetGets: [...split.pile2] };
  }
  return { selfGets: [...split.pile2], targetGets: [...split.pile1] };
}

// === 译梦师 · 伏笔 ===
// 对照：docs/manual/05-dream-thieves.md 译梦师
// 使用【解封】时，从牌库顶抽 2 张牌

export const INTERPRETER_SKILL_ID = 'thief_dream_interpreter.skill_0';

/** 译梦师技能：解封成功后触发，抽 2 张 */
export function applyInterpreterForeshadow(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player || player.characterId !== 'thief_dream_interpreter') return state;
  // 卡面没有「限一次」：每次使用【解封】都抽 2 张
  return drawCards(state, playerID, 2);
}

// === 阿波罗 · 崇拜 ===
// 出牌阶段：选择一位拥有贿赂牌的盗梦者，随机抽取该盗梦者的 1 张牌入手。回合限 1 次。
export const APOLLO_WORSHIP_SKILL_ID = 'thief_apollo.skill_0';

/** 阿波罗崇拜：从指定 target 随机抽 1 张手牌 */
export function applyApolloWorship(
  state: SetupState,
  selfID: string,
  targetID: string,
  pickIndex: number, // 由调用方提供随机索引（注入 D6 随机性）
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_apollo') return null;
  if (!player.isAlive) return null;
  if (selfID === targetID) return null;
  if (!canUseSkill(player, APOLLO_WORSHIP_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  const target = state.players[targetID];
  if (!target || !target.isAlive) return null;
  // target 必须是盗梦者且拥有贿赂牌（bribeReceived > 0）
  if (!isOutwardThief(state, targetID)) return null;
  if (target.bribeReceived <= 0) return null;
  if (target.hand.length === 0) return null;

  const safeIdx = ((pickIndex % target.hand.length) + target.hand.length) % target.hand.length;
  const picked = target.hand[safeIdx]!;

  let s = markSkillUsed(state, selfID, APOLLO_WORSHIP_SKILL_ID);
  const newTargetHand = [...target.hand];
  newTargetHand.splice(safeIdx, 1);
  s = {
    ...s,
    players: {
      ...s.players,
      [selfID]: { ...s.players[selfID]!, hand: [...s.players[selfID]!.hand, picked] },
      [targetID]: { ...s.players[targetID]!, hand: newTargetHand },
    },
  };
  return s;
}

// === 雅典娜 · 急智 ===
// 每当另一同层盗梦者对你使用行动牌时，你可以先从弃牌堆选取 1 张牌收入手牌。回合限 1 次。
// 详述：在每个不同玩家的回合都能使用一次；使用时机仅限同层的盗梦者，使用时检定。
// 触发与挂起见 engine/athenaWit.ts；这里是选牌与次数的纯函数。
// 对照：docs/manual/05-dream-thieves.md:160-170 雅典娜
export const ATHENA_WIT_SKILL_ID = 'thief_athena.skill_0';
/**
 * 急智最近一次用在哪个回合（回合号），记在雅典娜的 skillUsedThisGame 里。
 * 每个不同玩家的回合各能用一次，所以不能用「在雅典娜自己的回合开始清零」的 skillUsedThisTurn：
 * 别人的回合里那张表不会被清零，同一个值会一直挡到她自己的回合。
 */
export const ATHENA_WIT_TURN_KEY = 'thief_athena.skill_0.turn';

/** 雅典娜在回合号 turnNumber 这个回合里是否已经用过急智 */
export function athenaWitUsedInTurn(player: PlayerSetup, turnNumber: number): boolean {
  return player.skillUsedThisGame[ATHENA_WIT_TURN_KEY] === turnNumber;
}

/** 雅典娜·急智：从弃牌堆里选取 cardId 这一张收入手牌，并记下本回合已用（纯函数） */
export function applyAthenaWitPick(
  state: SetupState,
  selfID: string,
  cardId: CardID,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_athena') return null;
  if (!player.isAlive) return null;
  if (athenaWitUsedInTurn(player, state.turnNumber)) return null;
  const at = state.deck.discardPile.indexOf(cardId);
  if (at === -1) return null;
  const discardPile = [...state.deck.discardPile];
  discardPile.splice(at, 1);
  return {
    ...state,
    players: {
      ...state.players,
      [selfID]: {
        ...player,
        hand: [...player.hand, cardId],
        skillUsedThisGame: { ...player.skillUsedThisGame, [ATHENA_WIT_TURN_KEY]: state.turnNumber },
      },
    },
    deck: { ...state.deck, discardPile },
  };
}

// === 梦境猎手 · 满载 ===
// 成功解封后抽 = 当层现有心锁数（解封后心锁数）
export const EXTRACTOR_SKILL_ID = 'thief_extractor.skill_0';

export function applyExtractorBounty(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player || player.characterId !== 'thief_extractor') return state;
  if (!player.isAlive) return state;
  const layerInfo = state.layers[player.currentLayer];
  if (!layerInfo) return state;
  const drawN = layerInfo.heartLockValue;
  if (drawN <= 0) return state;
  return drawCards(state, playerID, drawN);
}

// === 欺诈师 · 盗心（两阶段：抽 + 还）===
// MVP 简化为一步 move：传入要抽的数量 N，自动随机选 N 张（用 D6 注入）
// 然后立即从 self 还 N 张（玩家选）。简化为：抽 N 张 + 立即还 N 张同时进行。
// 真实规则需"看到 target 手牌然后选择"，MVP 用：随机抽 N + self 选 N 张还
export const FORGER_SKILL_ID = 'thief_forger.skill_0';

export interface ForgerExchange {
  targetID: string;
  /** 从 target 抽走的牌（随机或指定 idx） */
  takenFromTarget: CardID[];
  /** 还给 target 的同等数量手牌 */
  returnedToTarget: CardID[];
}

export function applyForgerExchange(
  state: SetupState,
  selfID: string,
  ex: ForgerExchange,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_forger') return null;
  if (!player.isAlive) return null;
  if (selfID === ex.targetID) return null;
  if (!canUseSkill(player, FORGER_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  const target = state.players[ex.targetID];
  if (!target || !target.isAlive) return null;
  // 抽走数量 1-2
  const N = ex.takenFromTarget.length;
  if (N < 1 || N > 2) return null;
  if (ex.returnedToTarget.length !== N) return null;
  // 检查可行性：takenFromTarget 必须都在 target 手中（multiset）
  const targetHandCopy = [...target.hand];
  for (const cid of ex.takenFromTarget) {
    const idx = targetHandCopy.indexOf(cid);
    if (idx === -1) return null;
    targetHandCopy.splice(idx, 1);
  }
  // returnedToTarget 必须在 self 当前手中（含将获取的；这里 self 还在原手牌阶段，所以仅检查原手牌）
  const selfHandCopy = [...player.hand];
  for (const cid of ex.returnedToTarget) {
    const idx = selfHandCopy.indexOf(cid);
    if (idx === -1) return null;
    selfHandCopy.splice(idx, 1);
  }

  const s = markSkillUsed(state, selfID, FORGER_SKILL_ID);
  // self 手牌：去掉 returnedToTarget + 加入 takenFromTarget
  const newSelfHand = [...selfHandCopy, ...ex.takenFromTarget];
  // target 手牌：去掉 takenFromTarget + 加入 returnedToTarget
  const newTargetHand = [...targetHandCopy, ...ex.returnedToTarget];
  return {
    ...s,
    players: {
      ...s.players,
      [selfID]: { ...s.players[selfID]!, hand: newSelfHand },
      [ex.targetID]: { ...s.players[ex.targetID]!, hand: newTargetHand },
    },
  };
}

// === 小丑 · 赌博（纯函数） ===
// 略过抽牌阶段时可掷骰 → 抽 = 骰值；下回合 discard 必须全弃
export const JOKER_SKILL_ID = 'thief_joker.skill_0';

export function jokerDrawCount(roll: number): number {
  return Math.max(1, Math.min(6, roll));
}

// === 黑洞 · 吞噬 ===
// 抽牌阶段可以放弃抽牌，改为令所有当层的玩家各给你 1 张手牌。回合限 1 次。
// 有手牌的同层玩家（含梦主）各自选 1 张交出，没手牌的不用给；同层没有任何人给得出牌时不能发动。
// 放弃抽牌：不抽牌，也不受任何抽牌数增加效果影响。
// 对照：docs/manual/05-dream-thieves.md:150-158 黑洞（技能与详述）
export const BLACK_HOLE_LEVY_SKILL_ID = 'thief_black_hole.skill_0';

/** 黑洞发动吞噬时需要交牌的人：同层、存活、手里有牌的其他玩家，按座次排列 */
export function blackHoleLevyGivers(state: SetupState, blackHoleID: string): string[] {
  const holder = state.players[blackHoleID];
  if (!holder) return [];
  return state.playerOrder.filter((id) => {
    const p = state.players[id];
    return (
      id !== blackHoleID &&
      p !== undefined &&
      p.isAlive &&
      p.currentLayer === holder.currentLayer &&
      p.hand.length > 0
    );
  });
}

/** 第 1 步：黑洞发动。记一次使用，挂起交牌等待；牌和抽牌阶段都还没动 */
export function startBlackHoleLevy(state: SetupState, selfID: string): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_black_hole') return null;
  if (!player.isAlive) return null;
  if (!canUseSkill(player, BLACK_HOLE_LEVY_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  const givers = blackHoleLevyGivers(state, selfID);
  if (givers.length === 0) return null;
  const used = markSkillUsed(state, selfID, BLACK_HOLE_LEVY_SKILL_ID);
  return { ...used, pendingBlackHoleLevy: { blackHoleID: selfID, waiting: givers } };
}

/**
 * 第 2 步：名单里的一个人交出自己选的 1 张手牌。牌立即转进黑洞手里，交牌人移出名单；
 * 名单空了就清除等待（抽牌阶段由调用方结束）。牌不在手里、不在名单里返回 null。
 */
export function applyBlackHoleLevyGive(
  state: SetupState,
  giverID: string,
  cardId: CardID,
): SetupState | null {
  const levy = state.pendingBlackHoleLevy;
  if (!levy || !levy.waiting.includes(giverID)) return null;
  const giver = state.players[giverID];
  const holder = state.players[levy.blackHoleID];
  if (!giver || !holder) return null;
  const at = giver.hand.indexOf(cardId);
  if (at === -1) return null;
  const hand = [...giver.hand];
  hand.splice(at, 1);
  const waiting = levy.waiting.filter((id) => id !== giverID);
  return {
    ...state,
    players: {
      ...state.players,
      [giverID]: { ...giver, hand },
      [levy.blackHoleID]: { ...holder, hand: [...holder.hand, cardId] },
    },
    pendingBlackHoleLevy: waiting.length === 0 ? null : { ...levy, waiting },
  };
}

// === 黑天鹅 · 巡演（纯函数） ===
// 略过抽牌阶段，分发所有手牌（≥1）给任意盗梦者，抽 4 张
export const BLACK_SWAN_SKILL_ID = 'thief_black_swan.skill_0';

export function applyBlackSwanTour(
  state: SetupState,
  selfID: string,
  distribution: Record<string, CardID[]>,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_black_swan') return null;
  if (!player.isAlive) return null;
  if (player.hand.length === 0) return null;
  if (!canUseSkill(player, BLACK_SWAN_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  // 分发总数 = 手牌总数（必须全分）
  const totalDistributed = Object.values(distribution).reduce((sum, cs) => sum + cs.length, 0);
  if (totalDistributed !== player.hand.length) return null;
  // 分发的牌必须都在 self 手中（multiset）
  const handCopy = [...player.hand];
  for (const cards of Object.values(distribution)) {
    for (const cid of cards) {
      const idx = handCopy.indexOf(cid);
      if (idx === -1) return null;
      handCopy.splice(idx, 1);
    }
  }
  // 不能分给自己；接收者必须是活着的盗梦者
  for (const recvId of Object.keys(distribution)) {
    if (recvId === selfID) return null;
    const recv = state.players[recvId];
    if (!recv || !recv.isAlive || !isOutwardThief(state, recvId)) return null;
  }

  let s = markSkillUsed(state, selfID, BLACK_SWAN_SKILL_ID);
  const newPlayers = { ...s.players, [selfID]: { ...s.players[selfID]!, hand: [] } };
  for (const [recvId, cards] of Object.entries(distribution)) {
    newPlayers[recvId] = {
      ...newPlayers[recvId]!,
      hand: [...newPlayers[recvId]!.hand, ...cards],
    };
  }
  s = { ...s, players: newPlayers };
  // 抽 4 张
  s = drawCards(s, selfID, 4);
  return s;
}

// === 达尔文 · 淘汰（引擎里叫进化） ===
// 卡面：「你的出牌阶段，你可以将牌库顶2张牌收为手牌，然后将2张手牌按任意顺序放回牌库顶。每回合仅可使用一次。」
// 分两步：发动时先抽牌库顶 2 张并挂起；达尔文再从抽牌后的手牌里选刚好 2 张按顺序放回（第一张在最上面）。
// 所以放回的牌可以是刚抽到的，也可以是原有的手牌。
// 扩展角色，说明书没有收录，规则以卡面为准。
export const DARWIN_SKILL_ID = 'thief_darwin.skill_0';
const DARWIN_DRAW_COUNT = 2;

/** 第 1 步：发动。记一次使用，牌库顶 2 张收入手牌，挂起等达尔文选牌 */
export function startDarwinEvolution(state: SetupState, selfID: string): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_darwin') return null;
  if (!player.isAlive) return null;
  if (state.deck.cards.length < DARWIN_DRAW_COUNT) return null;
  if (!canUseSkill(player, DARWIN_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  const drawn = state.deck.cards.slice(0, DARWIN_DRAW_COUNT);
  const used = markSkillUsed(state, selfID, DARWIN_SKILL_ID);
  const owner = used.players[selfID]!;
  return {
    ...used,
    players: { ...used.players, [selfID]: { ...owner, hand: [...owner.hand, ...drawn] } },
    deck: { ...used.deck, cards: used.deck.cards.slice(DARWIN_DRAW_COUNT) },
    pendingDarwinReturn: { playerID: selfID },
  };
}

/**
 * 第 2 步：达尔文选刚好 2 张手牌按顺序（第一张在最上面）放回牌库顶，清除等待。
 * 张数不对、牌不在手里（按张数计，同名牌要有足够的张数）返回 null。
 */
export function applyDarwinReturn(
  state: SetupState,
  selfID: string,
  returnCards: readonly CardID[],
): SetupState | null {
  const pending = state.pendingDarwinReturn;
  if (!pending || pending.playerID !== selfID) return null;
  const player = state.players[selfID];
  if (!player) return null;
  if (!Array.isArray(returnCards) || returnCards.length !== DARWIN_DRAW_COUNT) return null;
  const rest = [...player.hand];
  for (const cid of returnCards) {
    const at = rest.indexOf(cid);
    if (at === -1) return null;
    rest.splice(at, 1);
  }
  return {
    ...state,
    players: { ...state.players, [selfID]: { ...player, hand: rest } },
    deck: { ...state.deck, cards: [...returnCards, ...state.deck.cards] },
    pendingDarwinReturn: null,
  };
}

// === 水瓶 · 同流（纯函数） ===
// 1: 每用过 2 张同名 → 弃牌堆取 1 张未用过的牌
// 2: 解封次数无限制（被动）
export const AQUARIUS_REUSE_SKILL_ID = 'thief_aquarius.skill_0';
export const AQUARIUS_UNLOCK_SKILL_ID = 'thief_aquarius.skill_1';

/** 水瓶·解封无限被动判定（与摩羯类似） */
export function isAquariusUnlimitedActive(player: PlayerSetup): boolean {
  if (player.characterId !== 'thief_aquarius') return false;
  if (!player.isAlive) return false;
  return true;
}

/**
 * 水瓶·凝聚可触发次数：本回合已打出的牌按 name 分组，每 2 张同名贡献 1 次触发额度
 * 扣除已使用的触发次数后即为剩余额度
 * 对照：docs/manual/05-dream-thieves.md 水瓶 46-50 行
 * 注：manual "金星·镜界复制不算"由 applyVenusMirrorWorld 不记录出牌自然实现（出牌记录只在出牌 move 的包装层里写）
 */
export function availableAquariusCoherence(state: SetupState, selfID: string): number {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_aquarius') return 0;
  if (!player.isAlive) return 0;
  const played = state.playedCardsThisTurn ?? [];
  const counts: Record<string, number> = {};
  for (const c of played) counts[c] = (counts[c] ?? 0) + 1;
  let pairs = 0;
  for (const n of Object.values(counts)) pairs += Math.floor(n / 2);
  const used = player.skillUsedThisTurn[AQUARIUS_REUSE_SKILL_ID] ?? 0;
  return Math.max(0, pairs - used);
}

/**
 * 水瓶·凝聚：从弃牌堆选 1 张"本回合未使用过的牌"收入手牌
 * 要求：availableAquariusCoherence > 0；pickCardId 在弃牌堆；pickCardId 不在 playedCardsThisTurn
 */
export function applyAquariusCoherence(
  state: SetupState,
  selfID: string,
  pickCardId: CardID,
): SetupState | null {
  const player = state.players[selfID];
  if (!player || player.characterId !== 'thief_aquarius') return null;
  if (!player.isAlive) return null;
  if (availableAquariusCoherence(state, selfID) <= 0) return null;
  // pick 必须在弃牌堆
  const idx = state.deck.discardPile.lastIndexOf(pickCardId);
  if (idx === -1) return null;
  // pick 必须本回合内未使用过
  const played = state.playedCardsThisTurn ?? [];
  if (played.includes(pickCardId)) return null;

  const newDiscard = [...state.deck.discardPile];
  newDiscard.splice(idx, 1);
  let s: SetupState = {
    ...state,
    players: {
      ...state.players,
      [selfID]: { ...player, hand: [...player.hand, pickCardId] },
    },
    deck: { ...state.deck, discardPile: newDiscard },
  };
  s = markSkillUsed(s, selfID, AQUARIUS_REUSE_SKILL_ID);
  return s;
}
