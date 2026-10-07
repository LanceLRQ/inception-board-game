// 对局状态的底层操作：抽牌 / 弃牌 / 回合推进 / 移层 / 解封与心锁等纯函数（不 mutate 入参），供 move、回合钩子与技能执行器复用

import { BASE_DRAW_COUNT } from './config.js';
import type { SetupState } from './setup.js';
import { LOST_LAYER, placePlayerInLayer, sendToLimbo } from './engine/death.js';

// === 抽牌阶段 ===
// 纯函数：不 mutate 入参，以免与 BGIO/immer draft 行为冲突
export function drawCards(
  state: SetupState,
  playerID: string,
  drawCount: number = BASE_DRAW_COUNT,
): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const drawn = state.deck.cards.slice(0, drawCount);
  if (drawn.length === 0) return state;

  const remaining = state.deck.cards.slice(drawCount);

  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: {
        ...player,
        hand: [...player.hand, ...drawn],
      },
    },
    deck: {
      ...state.deck,
      cards: remaining,
    },
  };
}

// === 海王星·泓洋 · 风暴 ===
// 每当心锁数减少时，或【时间风暴】效果结算后，从牌库顶弃掉 5 张牌（不足则弃到空）。
// 触发点在本文件的两个唯一入口：setLayerHeartLock（所有心锁减少）与 discardCard（时间风暴结算），
// 所以解封、技能、梦魇等路径都不需要各自再调用。
// 对照：docs/manual/06-dream-master.md 海王星·泓洋 32-39 行
const NEPTUNE_MASTER_ID = 'dm_neptune_ocean';
const NEPTUNE_STORM_DISCARD = 5;

/** 海王星·风暴：当前梦主是海王星·泓洋时，从牌库顶弃 5 张到弃牌堆；否则原样返回 */
export function applyNeptuneStorm(state: SetupState): SetupState {
  if (state.players[state.dreamMasterID]?.characterId !== NEPTUNE_MASTER_ID) return state;
  const n = Math.min(NEPTUNE_STORM_DISCARD, state.deck.cards.length);
  if (n === 0) return state;
  return {
    ...state,
    deck: {
      ...state.deck,
      cards: state.deck.cards.slice(n),
      discardPile: [...state.deck.discardPile, ...state.deck.cards.slice(0, n)],
    },
  };
}

// === 时间风暴 ===
const TIME_STORM_ID = 'action_time_storm' as CardID;
const TIME_STORM_FLIP_COUNT = 10;

/**
 * 时间风暴的效果：从牌库顶弃掉 10 张牌（进弃牌堆，不足则全弃），然后风暴自己移出游戏。
 * 调用时风暴牌已在弃牌堆顶（刚从手中弃出）。牌库被翻空后的胜负由终局判定处理。
 * 海王星·风暴在效果结算后接着触发，见 discardCard。
 * 对照：docs/manual/04-action-cards.md 时间风暴（发动效果与解析）
 */
function resolveTimeStorm(state: SetupState): SetupState {
  const pile = [...state.deck.discardPile];
  const stormIdx = pile.lastIndexOf(TIME_STORM_ID);
  if (stormIdx !== -1) pile.splice(stormIdx, 1);
  const flipCount = Math.min(TIME_STORM_FLIP_COUNT, state.deck.cards.length);
  return {
    ...state,
    deck: {
      ...state.deck,
      cards: state.deck.cards.slice(flipCount),
      discardPile: [...pile, ...state.deck.cards.slice(0, flipCount)],
    },
    removedFromGame: [...state.removedFromGame, TIME_STORM_ID],
  };
}

// === 从手中弃牌（唯一入口）===
// 手牌 → 弃牌堆的所有路径都走这里：弃牌阶段、复活代价、技能代价、梦魇逼弃、被效果弃掉手牌，
// 以及打出时间风暴本身。弃出的是时间风暴则触发其效果；
// 打出别的行动牌后进弃牌堆、交给别人、被抽走、放回牌库顶都不是「弃掉」，不走这里的触发。
// 对照：docs/manual/04-action-cards.md 时间风暴「从手中使用或弃掉，同样触发效果」
export function discardCard(state: SetupState, playerID: string, cardId: CardID): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  const idx = player.hand.indexOf(cardId);
  if (idx === -1) return state;

  const newHand = [...player.hand];
  newHand.splice(idx, 1);

  const discarded: SetupState = {
    ...state,
    players: {
      ...state.players,
      [playerID]: {
        ...player,
        hand: newHand,
      },
    },
    deck: {
      ...state.deck,
      discardPile: [...state.deck.discardPile, cardId],
    },
  };
  return cardId === TIME_STORM_ID ? applyNeptuneStorm(resolveTimeStorm(discarded)) : discarded;
}

/** 从手中依次弃掉多张牌，每张时间风暴各触发一次 */
export function discardCards(
  state: SetupState,
  playerID: string,
  cardIds: readonly CardID[],
): SetupState {
  let s = state;
  for (const cardId of cardIds) s = discardCard(s, playerID, cardId);
  return s;
}

// 强制弃至手牌上限
export function discardToLimit(
  state: SetupState,
  playerID: string,
  cardsToDiscard: CardID[],
): SetupState {
  return discardCards(state, playerID, cardsToDiscard);
}

// === 回合开始 ===
export function beginTurn(state: SetupState, playerID: string): SetupState {
  const player = state.players[playerID];
  if (!player) return state;

  return {
    ...state,
    turnPhase: 'draw',
    turnNumber: state.turnNumber + 1,
    currentPlayerID: playerID,
    unlockThisTurn: 0,
    // 出牌追踪 · 每回合清零（对照：setup.ts playedCardsThisTurn 注释）
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
    lastShootRoll: null,
    // 注意：不要在这里清空 removedFromGame —— 它是跨回合持久的"移出游戏"区，
    // 仅由 setup 初始化一次，由 time_storm 等 move 追加
    players: {
      ...state.players,
      [playerID]: {
        ...player,
        skillUsedThisTurn: {},
        successfulUnlocksThisTurn: 0,
      },
    },
  };
}

/**
 * 记录本回合打出一张行动牌 · 追加到 playedCardsThisTurn + 更新 lastPlayedCardThisTurn。
 * 出牌 move 表里的 move 由 engine/recordPlayedCards.ts 的包装层统一调用；
 * 不经过出牌 move 的路径（意念判官·定罪、格林射线·缉捕）在自己的 move 里调用（不改变其他状态，纯追加日志）。
 * 水星/金星/格林射线等能力
 */
export function recordCardPlayed(state: SetupState, cardId: string): SetupState {
  // 兼容早期 schema：字段缺失时 fallback 成空数组
  const prev = Array.isArray(state.playedCardsThisTurn) ? state.playedCardsThisTurn : [];
  return {
    ...state,
    playedCardsThisTurn: [...prev, cardId as SetupState['playedCardsThisTurn'][number]],
    lastPlayedCardThisTurn: cardId as SetupState['lastPlayedCardThisTurn'],
  };
}

// === 回合结束 ===
export function endTurn(state: SetupState): SetupState {
  const order = state.playerOrder;
  const currentIdx = order.indexOf(state.currentPlayerID);
  const nextIdx = (currentIdx + 1) % order.length;
  const nextPlayerID = order[nextIdx]!;

  return {
    ...state,
    turnPhase: 'turnEnd',
    // 下一回合开始时会调用 beginTurn 设置 draw phase
    currentPlayerID: nextPlayerID,
  };
}

// === 切换回合阶段 ===
export function setTurnPhase(state: SetupState, phase: SetupState['turnPhase']): SetupState {
  return { ...state, turnPhase: phase };
}

// === 移动玩家到层 ===
// 目标层为 0（迷失层）时等价于 sendToLimbo：迷失层与死亡是同一个状态，不允许只挪层不置死亡。
// 击杀（要交手牌）请直接调用 killPlayer。
export function movePlayerToLayer(
  state: SetupState,
  playerID: string,
  targetLayer: number,
): SetupState {
  if (targetLayer === LOST_LAYER) return sendToLimbo(state, playerID);
  return grantFortressColdnessChance(
    placePlayerInLayer(state, playerID, targetLayer),
    state,
    playerID,
  );
}

// === 要塞·冷酷的发动机会 ===
// 对照：docs/manual/06-dream-master.md 要塞 121 行「你的出牌阶段，当你移动到另一层梦境里」
// 梦主在自己的出牌阶段每换一次层，就在自己的 skillUsedThisTurn 里记一次机会（回合开始随之清零）；
// 已发动的次数记在技能标识下，可发动次数 = 机会数 - 已发动数（见 engine/skills.ts 的 fortressColdnessChancesLeft）。
// 梦主在自己回合里的换层都经 movePlayerToLayer：梦主自己的移动、行动牌、各类技能与世界观造成的换层。
// 唯一绕开它直接改层的是黑洞·吸纳，那是盗梦者在自己的回合发动，轮不到梦主自己的出牌阶段。
// 回合开始从迷失层复活不在出牌阶段（turnPhase 为 draw），层没变、进迷失层也不算。
export const FORTRESS_COLDNESS_CHANCES_KEY = 'dm_fortress.skill_0.chances';

function grantFortressColdnessChance(
  moved: SetupState,
  before: SetupState,
  playerID: string,
): SetupState {
  if (moved === before) return moved;
  if (moved.turnPhase !== 'action' || moved.currentPlayerID !== playerID) return moved;
  if (playerID !== moved.dreamMasterID) return moved;
  const master = moved.players[playerID];
  if (!master || !master.isAlive || master.characterId !== 'dm_fortress') return moved;
  return {
    ...moved,
    players: {
      ...moved.players,
      [playerID]: {
        ...master,
        skillUsedThisTurn: {
          ...master.skillUsedThisTurn,
          [FORTRESS_COLDNESS_CHANCES_KEY]:
            (master.skillUsedThisTurn[FORTRESS_COLDNESS_CHANCES_KEY] ?? 0) + 1,
        },
      },
    },
  };
}

// === 判断相邻层 ===
export function isAdjacentLayer(from: number, to: number): boolean {
  return Math.abs(from - to) === 1;
}

// === Move counter 递增 ===
export function incrementMoveCounter(state: SetupState): SetupState {
  return { ...state, moveCounter: state.moveCounter + 1 };
}

// === 改变某层心锁 ===
// 全引擎所有改变心锁的路径（解封、技能、梦魇、世界观）都经这里。
// 减少到 0 时翻开该层第一个未开金库并记录 openedBy。
// 对照：docs/manual/03-game-flow.md:34 当某一层的心锁全部被解开时，该层的金库便被打开
//
// 只管心锁与金库（以及海王星·风暴随心锁减少触发的弃牌）；金库打开后的结算（金币给贿赂牌、秘密判胜）由调用方在其后处理，
// 「解封成功」才触发的被动（译梦师·伏笔、梦境猎手·满载、空间女王·监察）也不在这里。
//
// actorID：减少心锁的发动者，翻开的金库记在他名下。
// bySkill：发动者靠技能减少心锁。裁定 R-23：这也算本回合的成功解锁，
//   占用解锁次数（见 skills.ts 的 canMakeSuccessfulUnlock）；心锁实际没减少则不计。
//   对照：docs/manual/03-game-flow.md:26-28 一旦本回合心锁减少后，盗梦者不能再以技能或行动的方式解锁
export const HEART_LOCK_REDUCED_BY_SKILL_KEY = 'heartLockReducedBySkill';

export function setLayerHeartLock(
  state: SetupState,
  layer: number,
  nextValue: number,
  opts: { actorID?: string; bySkill?: boolean } = {},
): SetupState {
  const layerState = state.layers[layer];
  if (!layerState) return state;
  const next = Math.max(0, nextValue);
  if (next === layerState.heartLockValue) return state;

  const reduced = next < layerState.heartLockValue;
  let vaults = state.vaults;
  if (reduced && next === 0) {
    const vaultIdx = vaults.findIndex((v) => v.layer === layer && !v.isOpened);
    if (vaultIdx !== -1) {
      vaults = vaults.map((v, i) =>
        i === vaultIdx ? { ...v, isOpened: true, openedBy: opts.actorID ?? null } : v,
      );
    }
  }

  let players = state.players;
  const actor = opts.actorID ? players[opts.actorID] : undefined;
  if (reduced && opts.bySkill && actor) {
    players = {
      ...players,
      [actor.id]: {
        ...actor,
        skillUsedThisTurn: {
          ...actor.skillUsedThisTurn,
          [HEART_LOCK_REDUCED_BY_SKILL_KEY]:
            (actor.skillUsedThisTurn[HEART_LOCK_REDUCED_BY_SKILL_KEY] ?? 0) + 1,
        },
      },
    };
  }

  const updated: SetupState = {
    ...state,
    layers: { ...state.layers, [layer]: { ...layerState, heartLockValue: next } },
    vaults,
    players,
  };
  // 海王星·风暴：一次减少事件只触发一次（一次减 2 个也只弃 5 张），增加不触发
  return reduced ? applyNeptuneStorm(updated) : updated;
}

// === 解封成功结算 ===
// 对照：docs/manual/04-action-cards.md 解封
export function applyUnlockSuccess(state: SetupState): SetupState {
  const pending = state.pendingUnlock;
  if (!pending) return state;

  const { playerID, layer } = pending;
  const layerState = state.layers[layer];
  if (!layerState) return state;

  const lowered = setLayerHeartLock(state, layer, layerState.heartLockValue - 1, {
    actorID: playerID,
  });
  const player = lowered.players[playerID]!;

  return {
    ...lowered,
    pendingUnlock: null,
    players: {
      ...lowered.players,
      [playerID]: {
        ...player,
        successfulUnlocksThisTurn: player.successfulUnlocksThisTurn + 1,
        unlockCount: player.unlockCount + 1,
      },
    },
  };
}

// === 取消解封 ===
export function applyUnlockCancel(state: SetupState): SetupState {
  return {
    ...state,
    pendingUnlock: null,
  };
}

// 导入 CardID 类型
import type { CardID } from '@icgame/shared';
