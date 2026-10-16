// 梦主世界观
// 对照：docs/manual/06-dream-master.md

import type { SetupState } from '../../setup.js';
import { movePlayerToLayer, discardCards, setTurnPhase } from '../../stateOps.js';
import { killPlayer, sendToLimbo } from '../death.js';
import { resolveShootCustom } from '../../dice.js';
import type { CardID, Layer } from '@icgame/shared';
import { canUseSkill, markSkillUsed } from './usage.js';
import { applyTaurusHorn } from './thiefShoot.js';
import { isShootClassCard, applyKickEffect } from './thiefMovement.js';
import { isOutwardThief, getMasterCharacterID, canSaturnFreeMove } from './masterSkills.js';

// === 冥王星·地狱世界观 ===
// 盗梦者抽牌阶段抽牌数 = 1 颗骰子的掷骰结果
// 抽牌阶段结束的那一刻手牌 ≥ 6 → 该盗梦者本回合照常行动，回合结束时进入迷失层；
// 此后手牌再变多不追加（只在抽牌阶段检视一次）。进迷失层不是被击杀，不交手牌。
// 对照：docs/manual/06-dream-master.md 冥王星·地狱（世界观与详述）

const PLUTO_LOST_HAND_THRESHOLD = 6;

/** 抽牌阶段结束时检视手牌后打下的标记；记在每回合自动清零的 skillUsedThisTurn 里 */
export const PLUTO_HELL_MARK_KEY = 'dm_pluto_hell.world.marked';

/** 冥王星地狱世界观激活 */
export function isPlutoHellWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_pluto_hell';
}

/**
 * 抽牌阶段结束 → 进入行动阶段。
 * 所有把 turnPhase 从 draw 切到 action 的路径（正常抽牌、跳过、小丑·赌博、黑天鹅·巡演、黑洞·吞噬）都走这里，
 * 冥王星世界观在这一刻检视当前玩家的手牌数。
 */
export function endDrawPhase(state: SetupState): SetupState {
  const s = setTurnPhase(state, 'action');
  if (!isPlutoHellWorldActive(s)) return s;
  const playerID = s.currentPlayerID;
  const p = s.players[playerID];
  if (!p || !p.isAlive || !isOutwardThief(s, playerID)) return s;
  if (p.hand.length < PLUTO_LOST_HAND_THRESHOLD) return s;
  return {
    ...s,
    players: {
      ...s.players,
      [playerID]: {
        ...p,
        skillUsedThisTurn: { ...p.skillUsedThisTurn, [PLUTO_HELL_MARK_KEY]: 1 },
      },
    },
  };
}

/** 冥王星世界观：回合结束时，抽牌阶段打过标记的盗梦者进入迷失层（不算击杀） */
export function applyPlutoHellLostCheck(state: SetupState, playerID: string): SetupState {
  const p = state.players[playerID];
  if (!p || (p.skillUsedThisTurn[PLUTO_HELL_MARK_KEY] ?? 0) < 1) return state;
  const rest = { ...p.skillUsedThisTurn };
  delete rest[PLUTO_HELL_MARK_KEY];
  const cleared: SetupState = {
    ...state,
    players: { ...state.players, [playerID]: { ...p, skillUsedThisTurn: rest } },
  };
  if (!isPlutoHellWorldActive(cleared)) return cleared;
  if (!p.isAlive || !isOutwardThief(cleared, playerID) || p.currentLayer === 0) return cleared;
  return sendToLimbo(cleared, playerID);
}

// === 土星·领地世界观 ===
// 拥有贿赂的盗梦者，自己回合出牌阶段可不用行动牌移动一次到相邻层
// 已有 canSaturnFreeMove 判定；此处加 ID + 应用函数（per-turn）
// 对照：docs/manual/06-dream-master.md 土星·领地 世界观

export const SATURN_FREE_MOVE_SKILL_ID = 'dm_saturn_territory.worldview';

/** 土星·领地世界观：盗梦者免费移动到相邻层（自己回合限 1 次） */
export function applySaturnFreeMove(
  state: SetupState,
  playerID: string,
  targetLayer: Layer,
): SetupState | null {
  if (!canSaturnFreeMove(state, playerID)) return null;
  const p = state.players[playerID];
  if (!p) return null;
  if (!canUseSkill(p, SATURN_FREE_MOVE_SKILL_ID, 'ownTurnOncePerTurn')) return null;
  if (targetLayer < 1 || targetLayer > 4) return null;
  if (Math.abs(p.currentLayer - targetLayer) !== 1) return null;

  let s = markSkillUsed(state, playerID, SATURN_FREE_MOVE_SKILL_ID);
  s = movePlayerToLayer(s, playerID, targetLayer);
  return s;
}

// === 天王星·苍穹世界观 ===
// 盗梦者因行动牌效果改变梦境层数 → 牌库顶弃 1 张
// 梦主贿赂派发完毕 → 改弃 2 张
// 复活离开迷失层不属于行动牌效果 → 不弃
// 对照：docs/manual/06-dream-master.md 天王星·苍穹 世界观

/** 天王星·苍穹世界观激活 */
export function isUranusFirmamentWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_uranus_firmament';
}

/** 行动牌触发的层数变更 → 梦主弃牌堆弃 1（或 2） */
export function applyUranusFirmamentMoveDiscard(state: SetupState, playerID: string): SetupState {
  if (!isUranusFirmamentWorldActive(state)) return state;
  const p = state.players[playerID];
  if (!p || !isOutwardThief(state, playerID)) return state;
  // 梦主未派发贿赂为 0 → 弃 2，否则弃 1
  const inPool = state.bribePool.filter((b) => b.status === 'inPool').length;
  const discardCount = inPool === 0 ? 2 : 1;
  const n = Math.min(discardCount, state.deck.cards.length);
  if (n === 0) return state;
  const dropped = state.deck.cards.slice(0, n);
  return {
    ...state,
    deck: {
      ...state.deck,
      cards: state.deck.cards.slice(n),
      discardPile: [...state.deck.discardPile, ...dropped],
    },
  };
}

// === 火星·战场世界观 ===
// 玩家自己回合出牌阶段：弃 2 张非 SHOOT 类牌 → 弃牌堆取任意 1 张 SHOOT 类入手
// 对照：docs/manual/06-dream-master.md 火星·战场 世界观

export const MARS_BATTLEFIELD_WORLD_SKILL_ID = 'dm_mars_battlefield.worldview';

/** 火星·战场世界观激活 */
export function isMarsBattlefieldWorldActive(state: SetupState): boolean {
  return getMasterCharacterID(state) === 'dm_mars_battlefield';
}

// === 皇城世界观 · 贿赂后 SHOOT（纯函数） ===
// 对照：docs/manual/06-dream-master.md 皇城
// 收到贿赂的玩家选一个未收到贿赂的盗梦者视为 SHOOT，掷骰结果 -3
// 每收到 1 张贿赂牌获得 1 次机会（imperialShootCharges），发动即消耗 1 次
export const IMPERIAL_CITY_WORLD_SKILL_ID = 'dm_imperial_city.worldview';

/**
 * 收到 1 张贿赂牌时调用：皇城世界观下，该玩家获得 1 次视为 SHOOT 的发动机会。
 * 对照：docs/manual/06-dream-master.md 皇城「当玩家收到贿赂牌时」
 */
function grantImperialShootCharge(state: SetupState, playerID: string): SetupState {
  if (getMasterCharacterID(state) !== 'dm_imperial_city') return state;
  const p = state.players[playerID];
  if (!p) return state;
  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: { ...p, imperialShootCharges: (p.imperialShootCharges ?? 0) + 1 },
    },
  };
}

/** 贿赂池里还没派出的牌在池中的下标（保持池内顺序） */
export function inPoolBribeIndexes(state: SetupState): number[] {
  const indexes: number[] = [];
  state.bribePool.forEach((b, i) => {
    if (b.status === 'inPool') indexes.push(i);
  });
  return indexes;
}

/**
 * 把贿赂池里第 poolIndex 张牌派给 targetID：成功的牌（DEAL）使其转为梦主阵营，
 * 失败的牌无任何效果；记收到的张数，皇城世界观下再给 1 次视为 SHOOT 的机会。
 * 该位置不是池中未派出的牌、或目标不存在时返回 null。
 * 贿赂牌只在金币金库打开与【梦境窥视】效果①时派发，其余路径不得直接调用。
 * 对照：docs/manual/03-game-flow.md 贿赂&背叛者（38-45 行）
 */
export function dealBribeCard(
  state: SetupState,
  targetID: string,
  poolIndex: number,
): SetupState | null {
  const target = state.players[targetID];
  const bribe = state.bribePool[poolIndex];
  if (!target || !bribe || bribe.status !== 'inPool') return null;
  const isDeal = bribe.kind === 'deal';
  return grantImperialShootCharge(
    {
      ...state,
      bribePool: state.bribePool.map((b, i) =>
        i === poolIndex
          ? {
              ...b,
              status: isDeal ? ('deal' as const) : ('dealt' as const),
              heldBy: targetID,
              originalOwnerId: targetID,
            }
          : b,
      ),
      players: {
        ...state.players,
        [targetID]: {
          ...target,
          bribeReceived: target.bribeReceived + 1,
          faction: isDeal ? ('master' as const) : target.faction,
        },
      },
    },
    targetID,
  );
}

/**
 * 皇城世界观：收到贿赂牌的玩家视为使用 1 张【SHOOT】，对方掷骰结果 -3。
 * 发起者是金牛时同样可以启动号角：金牛自己的骰不减；rollHorn 在对方未被击杀时才掷。
 * 对照：docs/manual/05-dream-thieves.md 金牛 79 行
 */
export function applyImperialCityWorldShoot(
  state: SetupState,
  shooterID: string,
  targetID: string,
  roll: number,
  rollHorn?: () => number,
): SetupState | null {
  const shooter = state.players[shooterID];
  const target = state.players[targetID];
  if (!shooter || !target) return null;
  if (!shooter.isAlive || !target.isAlive) return null;
  if (shooterID === targetID) return null;
  if (!isOutwardThief(state, targetID)) return null;
  if (target.bribeReceived > 0) return null;
  // 发起者必须有未用掉的机会
  const charges = shooter.imperialShootCharges ?? 0;
  if (charges <= 0) return null;
  const spent: SetupState = {
    ...state,
    players: {
      ...state.players,
      [shooterID]: { ...shooter, imperialShootCharges: charges - 1 },
    },
  };
  // 普通 SHOOT：deathFaces=[1], moveFaces=[2,3,4]（规则 docs/manual/04-action-cards.md SHOOT 章）
  const modifiedRoll = Math.max(1, roll - 3);
  const baseResult = resolveShootCustom(modifiedRoll, [1], [2, 3, 4]);
  const hornKills =
    baseResult !== 'kill' &&
    shooter.characterId === 'thief_taurus' &&
    rollHorn !== undefined &&
    applyTaurusHorn(modifiedRoll, rollHorn()) === 'kill';
  const result = hornKills ? 'kill' : baseResult;
  if (result === 'kill') {
    return killPlayer(spent, targetID, shooterID);
  }
  if (result === 'move') {
    const cur = spent.players[targetID]!.currentLayer;
    const newLayer = cur >= 4 ? cur - 1 : cur + 1;
    return movePlayerToLayer(spent, targetID, newLayer as Layer);
  }
  // miss
  return spent;
}

// === 金星·镜界世界观 · 复制效果 ===
// 对照：docs/manual/06-dream-master.md 金星·镜界
// 弃 2 张牌，重复执行本回合内之前用过的 SHOOT/KICK 效果
export const VENUS_MIRROR_WORLD_SKILL_ID = 'dm_venus_mirror.worldview';

// 可复制的行动牌：SHOOT 类 + KICK
const MIRRORABLE_KICK = 'action_kick';

function isMirrorableCard(cardId: CardID): boolean {
  return isShootClassCard(cardId) || cardId === MIRRORABLE_KICK;
}

/** 金星·镜界此刻复制的是不是 SHOOT（复制本回合最后一张可复制的牌；复制 SHOOT 才要掷骰） */
export function venusMirrorCopiesShoot(state: SetupState): boolean {
  const mirrorable = (state.playedCardsThisTurn ?? []).filter((c) => isMirrorableCard(c));
  const last = mirrorable[mirrorable.length - 1];
  return last !== undefined && last !== MIRRORABLE_KICK;
}

export function applyVenusMirrorWorld(
  state: SetupState,
  selfID: string,
  targetID: string,
  discardedCardIds: CardID[],
  roll: number,
): SetupState | null {
  const self = state.players[selfID];
  if (!self || !self.isAlive) return null;
  // 梦主必须是金星·镜界
  const master = state.players[state.dreamMasterID];
  if (!master || master.characterId !== 'dm_venus_mirror') return null;
  // 回合限 1
  if ((self.skillUsedThisTurn[VENUS_MIRROR_WORLD_SKILL_ID] ?? 0) >= 1) return null;
  // 弃 2 张牌
  if (discardedCardIds.length !== 2) return null;
  for (const cid of discardedCardIds) {
    if (!self.hand.includes(cid)) return null;
  }
  // 必须有可复制的牌
  const played = state.playedCardsThisTurn ?? [];
  const mirrorable = played.filter((c) => isMirrorableCard(c));
  if (mirrorable.length === 0) return null;

  const target = state.players[targetID];
  if (!target || !target.isAlive) return null;
  if (selfID === targetID) return null;

  // 弃牌（弃的是时间风暴则触发效果）
  const handCopy = [...self.hand];
  for (const cid of discardedCardIds) {
    const idx = handCopy.indexOf(cid);
    if (idx < 0) return null;
    handCopy.splice(idx, 1);
  }

  const lastCard = mirrorable[mirrorable.length - 1]!;
  let s = discardCards(state, selfID, discardedCardIds);
  s = markSkillUsed(s, selfID, VENUS_MIRROR_WORLD_SKILL_ID);

  if (lastCard === MIRRORABLE_KICK) {
    // 重复执行 KICK 的效果：与目标交换梦境层（对照 docs/manual/04-action-cards.md KICK）
    const kicked = applyKickEffect(s, selfID, targetID);
    if (kicked === null) return null;
    s = kicked;
  } else {
    // SHOOT 效果：普通骰面 [1] 死 [2-4] 移 [5-6] miss
    const result = resolveShootCustom(roll, [1], [2, 3, 4]);
    if (result === 'kill') {
      s = killPlayer(s, targetID, selfID);
    } else if (result === 'move') {
      const cur = s.players[targetID]!.currentLayer;
      const newLayer = cur >= 4 ? cur - 1 : cur + 1;
      s = movePlayerToLayer(s, targetID, newLayer as Layer);
    }
    // miss: 无效果
  }
  return s;
}
