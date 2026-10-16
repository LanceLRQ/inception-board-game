// 梦魇触发时机辅助
// 对照：docs/manual/03-game-flow.md / docs/manual/07-nightmare-cards.md

import type { SetupState, BribeSetup } from '../../setup.js';
import { seededShuffle } from '../../prng.js';
import type { CardID } from '@icgame/shared';
import { canUseSkill, markSkillUsed } from './usage.js';
import { isShootClassCard } from './thiefMovement.js';
import { isOutwardThief } from './masterSkills.js';
import { isMarsBattlefieldWorldActive } from './masterWorldviews.js';

// ============================================================================
// 梦魇触发时机辅助（auto-detect + un-revealed discard）
// ============================================================================
// 对照：docs/manual/03-game-flow.md 第 94-102 行 / docs/manual/07-nightmare-cards.md
// 触发：盗梦者打开放有金币的金库 → 梦主三选一（move masterVaultDecision）
//   1. 派发贿赂牌，然后弃掉该层梦魇
//   2. 翻开该层梦魇并发动效果，不派发贿赂牌
//   3. 弃掉该层梦魇，不派发贿赂牌

/** 找出所有「金币金库已开 + 同层有未翻开梦魇」的层（待梦主决策） */
export function findCoinVaultsWithHiddenNightmare(state: SetupState): number[] {
  const result: number[] = [];
  for (const v of state.vaults) {
    if (!v.isOpened) continue;
    if (v.contentType !== 'coin') continue;
    const ls = state.layers[v.layer];
    if (!ls) continue;
    if (!ls.nightmareId) continue;
    if (ls.nightmareRevealed) continue;
    if (ls.nightmareTriggered) continue;
    result.push(v.layer);
  }
  return result;
}

/** 弃掉指定层的梦魇（不发动）：离开棋盘、记为已发动并计入已用梦魇；该层没有梦魇时原样返回 */
export function discardNightmareOnLayer(state: SetupState, layer: number): SetupState {
  const ls = state.layers[layer];
  if (!ls || !ls.nightmareId) return state;
  const discardedId = ls.nightmareId;
  return {
    ...state,
    layers: {
      ...state.layers,
      [layer]: {
        ...ls,
        nightmareId: null,
        nightmareRevealed: false,
        nightmareTriggered: true,
      },
    },
    usedNightmareIds: [...state.usedNightmareIds, discardedId],
  };
}

/** 弃掉指定层的未翻开梦魇；该层没有梦魇或梦魇已翻开时返回 null（已翻开的走 masterDiscardNightmare） */
export function applyDiscardHiddenNightmare(state: SetupState, layer: number): SetupState | null {
  const ls = state.layers[layer];
  if (!ls || !ls.nightmareId || ls.nightmareRevealed) return null;
  return discardNightmareOnLayer(state, layer);
}

/** 火星·战场世界观：弃 2 非 SHOOT 换 1 SHOOT */
export function applyMarsBattlefieldExchange(
  state: SetupState,
  playerID: string,
  discardCardIds: [CardID, CardID],
  targetShootCardId: CardID,
): SetupState | null {
  if (!isMarsBattlefieldWorldActive(state)) return null;
  const p = state.players[playerID];
  if (!p || !p.isAlive) return null;
  // 两张要弃的牌必须在手牌里且都不是 SHOOT 类
  const [c1, c2] = discardCardIds;
  if (c1 === c2) {
    // 同名两张：手牌至少需要 2 张同名
    if (p.hand.filter((c) => c === c1).length < 2) return null;
  } else {
    if (!p.hand.includes(c1) || !p.hand.includes(c2)) return null;
  }
  if (isShootClassCard(c1) || isShootClassCard(c2)) return null;
  // 目标 SHOOT 必须是 SHOOT 类且在弃牌堆
  if (!isShootClassCard(targetShootCardId)) return null;
  const targetIdx = state.deck.discardPile.indexOf(targetShootCardId);
  if (targetIdx === -1) return null;

  // 从手牌移除 c1, c2
  const newHand = [...p.hand];
  const i1 = newHand.indexOf(c1);
  newHand.splice(i1, 1);
  const i2 = newHand.indexOf(c2);
  newHand.splice(i2, 1);
  // 加入 SHOOT
  newHand.push(targetShootCardId);

  // 更新弃牌堆：移除目标 SHOOT，追加两张弃牌
  const newDiscard = [...state.deck.discardPile];
  newDiscard.splice(targetIdx, 1);
  newDiscard.push(c1, c2);

  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: { ...p, hand: newHand },
    },
    deck: { ...state.deck, discardPile: newDiscard },
  };
}

// ============================================================================
// 水星·航路 世界观：梦主翻开时 bribePool 额外 +1 张失败贿赂
// 对照：docs/manual/06-dream-master.md 水星·航路
// 接入时机：startGame move 分配梦主角色后立即调用（此时 bribePool 仍为初始 3+3）
// ============================================================================

/**
 * 水星·航路世界观：若梦主为水星，bribePool 追加 1 张 fail 状态的贿赂。
 * 对非水星梦主直接返回原 state。
 */
export function applyMercuryRouteExtraFailBribe(
  state: SetupState,
  masterCharacterID: CardID | null,
): SetupState {
  if (masterCharacterID !== 'dm_mercury_route') return state;
  const extra: BribeSetup = {
    id: '',
    kind: 'fail',
    status: 'inPool',
    heldBy: null,
    originalOwnerId: null,
  };
  const allInPool = state.bribePool.every((b) => b.status === 'inPool');
  if (!allInPool) {
    // 已有牌派出时不能重编号（编号已被对方看见）：沿用旧办法，取最大编号加一
    const maxIndex = state.bribePool.reduce((max, b) => {
      const m = /^bribe-(\d+)$/.exec(b.id);
      return m ? Math.max(max, Number(m[1])) : max;
    }, -1);
    return { ...state, bribePool: [...state.bribePool, { ...extra, id: `bribe-${maxIndex + 1}` }] };
  }
  // 追加后整池重新洗乱并重新编号：编号与池内顺序都推不出成败（视图对所有人公开编号）。
  // 按种子洗，同一局可重放。
  const merged = [...state.bribePool, extra];
  const shuffled = seededShuffle(merged, state.rngSeed, 'bribe-mercury');
  return {
    ...state,
    bribePool: shuffled.map((b, i) => ({ ...b, id: `bribe-${i}` })),
  };
}

// ============================================================================
// 金星·镜界 · 重影
// 对照：docs/manual/06-dream-master.md 金星·镜界
// 你的回合出牌前，可展示牌库顶等于非死亡盗梦者数的牌，然后展示任意手牌
// 并将所有展示的同名牌收入手牌，其余混洗放回牌库顶。回合限 1 次
//
// 实现语义：
//   1. N = 非死亡盗梦者数
//   2. 从牌库顶取 N 张（若牌库不足则不足即可，按实际）
//   3. 统计"展示的手牌名字集合"
//   4. 牌库顶取出中，名字 ∈ 手牌集合的 → 进入梦主手牌
//   5. 其余（不匹配的）→ 由调用方提供 shuffle 后的顺序放回牌库顶
// ============================================================================

export const VENUS_DOUBLE_SKILL_ID = 'dm_venus_mirror.skill_0';

/**
 * 金星·重影：纯函数实现。
 * @param state        当前状态
 * @param masterID     梦主 playerID
 * @param revealedHandIds 梦主展示的手牌 id 数组（multiset 视角；必须都在手牌中）
 * @param shuffle      外部注入的 shuffle（用于测试确定性；move 层传入 BGIO random.Shuffle）
 * @returns 新 state 或 null（失败）
 */
export function applyVenusDouble(
  state: SetupState,
  masterID: string,
  revealedHandIds: readonly CardID[],
  shuffle: <T>(arr: readonly T[]) => T[],
): SetupState | null {
  const master = state.players[masterID];
  if (!master) return null;
  if (master.characterId !== 'dm_venus_mirror') return null;
  if (!master.isAlive) return null;
  if (!canUseSkill(master, VENUS_DOUBLE_SKILL_ID, 'ownTurnOncePerTurn')) return null;

  // 展示的手牌必须全部在手中（multiset）
  const handCopy = [...master.hand];
  for (const cid of revealedHandIds) {
    const idx = handCopy.indexOf(cid);
    if (idx === -1) return null;
    handCopy.splice(idx, 1);
  }

  // N = 非死亡盗梦者数
  const aliveThievesCount = Object.entries(state.players).filter(
    ([id, p]) => isOutwardThief(state, id) && p.isAlive,
  ).length;
  if (aliveThievesCount <= 0) return null;

  // 牌库不足时按实际可用数量
  const takeN = Math.min(aliveThievesCount, state.deck.cards.length);
  const topSlice = state.deck.cards.slice(0, takeN);
  const restDeck = state.deck.cards.slice(takeN);

  // 匹配：展示的手牌名字集合
  const revealedNames = new Set<string>(revealedHandIds);
  const matched: CardID[] = [];
  const unmatched: CardID[] = [];
  for (const cid of topSlice) {
    if (revealedNames.has(cid)) matched.push(cid);
    else unmatched.push(cid);
  }

  let s = markSkillUsed(state, masterID, VENUS_DOUBLE_SKILL_ID);
  // 匹配的牌入梦主手牌；剩余混洗放回牌库顶
  const shuffledBack = shuffle(unmatched);
  s = {
    ...s,
    deck: { ...s.deck, cards: [...shuffledBack, ...restDeck] },
    players: {
      ...s.players,
      [masterID]: { ...s.players[masterID]!, hand: [...s.players[masterID]!.hand, ...matched] },
    },
  };
  return s;
}
