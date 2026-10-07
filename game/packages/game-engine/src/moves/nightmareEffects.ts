// 梦魇牌的发动：效果分发，以及发动后该层梦魇的清理。

import type { CardID } from '@icgame/shared';
import { PLAYER_COUNT_CONFIGS } from '../config.js';
import { sendToLimbo } from '../engine/death.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import { dealBribeCard, inPoolBribeIndexes, isOutwardThief } from '../engine/skills.js';
import type { SetupState } from '../setup.js';
import { discardCards, movePlayerToLayer, setLayerHeartLock } from '../stateOps.js';
import type { BGIORandom } from './common.js';

// --- 内部 helper：发动梦魇并清理 ---
// 梦魇效果生效后，该层梦魇离开棋盘、记为已发动并计入已用梦魇；效果非法时整体非法。
export function activateNightmareOnLayer(
  G: SetupState,
  layer: number,
  random: BGIORandom,
  params?: Record<string, unknown>,
): SetupState | typeof INVALID_MOVE {
  const nid = G.layers[layer]?.nightmareId;
  if (!nid) return INVALID_MOVE;
  const next = applyNightmareEffect(G, layer, nid, random, params);
  if (next === INVALID_MOVE) return INVALID_MOVE;
  return {
    ...next,
    layers: {
      ...next.layers,
      [layer]: {
        ...next.layers[layer]!,
        nightmareId: null,
        nightmareRevealed: false,
        nightmareTriggered: true,
      },
    },
    usedNightmareIds: [...next.usedNightmareIds, nid],
  };
}

/**
 * 梦魇效果分发
 * 对照：docs/manual/07-nightmare-cards.md
 * 六张梦魇牌都已实现：饥饿撕咬 / 绝望风暴 / 深空坠落 / 致命漩涡 / 回音萦绕 / 邪念瘟疫；
 * 其他标识返回非法
 */
export function applyNightmareEffect(
  G: SetupState,
  layer: number,
  nid: CardID,
  random: BGIORandom,
  _params?: Record<string, unknown>,
): SetupState | typeof INVALID_MOVE {
  const ls = G.layers[layer];
  if (!ls) return INVALID_MOVE;

  if (nid === 'nightmare_despair_storm') {
    // 从牌库顶弃 10 张；+5 × 其他已开金库数
    const openedOther = G.vaults.filter((v) => v.isOpened && v.layer !== layer).length;
    const target = 10 + openedOther * 5;
    const eff = Math.min(target, G.deck.cards.length);
    const dropped = G.deck.cards.slice(0, eff);
    return {
      ...G,
      deck: {
        cards: G.deck.cards.slice(eff),
        discardPile: [...G.deck.discardPile, ...dropped],
      },
    };
  }

  if (nid === 'nightmare_space_fall') {
    // 该层所有盗梦者掷 1 骰：5/6 或当前层数 → 迷失层；否则移到结果数字对应层
    let s = G;
    const thieves = [...ls.playersInLayer].filter((pid) => {
      const p = s.players[pid];
      return p && isOutwardThief(s, pid) && p.isAlive;
    });
    for (const pid of thieves) {
      const roll = random.D6();
      if (roll === 5 || roll === 6 || roll === layer) {
        s = sendToLimbo(s, pid);
      } else if (roll >= 1 && roll <= 4) {
        s = movePlayerToLayer(s, pid, roll);
      }
    }
    return s;
  }

  if (nid === 'nightmare_vortex') {
    // 当层玩家 → 迷失层（保留手牌）；其余玩家移到当层 + 弃所有手牌
    let s = G;
    const onLayer = [...ls.playersInLayer];
    for (const pid of onLayer) {
      const p = s.players[pid];
      if (!p || !p.isAlive) continue;
      s = sendToLimbo(s, pid);
    }
    // 再处理其他层玩家
    for (const pid of G.playerOrder) {
      const p = s.players[pid];
      if (!p || !p.isAlive) continue;
      if (p.currentLayer === 0) continue;
      if (p.currentLayer === layer) continue;
      s = discardCards(s, pid, p.hand);
      s = movePlayerToLayer(s, pid, layer);
    }
    return s;
  }

  if (nid === 'nightmare_echo') {
    // 梦主选一层：恢复该层原有心锁数 或 当前心锁数 +1
    // params: { targetLayer: number, action: 'restore' | 'add' }
    const targetLayer = _params?.targetLayer as number | undefined;
    const action = _params?.action as 'restore' | 'add' | undefined;
    if (!targetLayer || !action) return INVALID_MOVE;
    const tls = G.layers[targetLayer];
    if (!tls) return INVALID_MOVE;
    let newValue: number;
    if (action === 'add') {
      newValue = tls.heartLockValue + 1;
    } else {
      const cfg = PLAYER_COUNT_CONFIGS[G.playerOrder.length];
      const original = cfg?.heartLocks[targetLayer - 1] ?? tls.heartLockValue;
      newValue = Math.max(tls.heartLockValue, original);
    }
    return setLayerHeartLock(G, targetLayer, newValue);
  }

  if (nid === 'nightmare_plague') {
    // 梦主先派发贿赂给当层盗梦者（bribedTargets 指定，可以一张不发），派发完之后
    // 该层手里一张贿赂牌都没有的盗梦者进入迷失层；此前收到过贿赂牌的（含失败的）不受影响，
    // 不算被击杀。贿赂池已空时点名的人拿不到牌，只在他本来就没有贿赂牌时进迷失层。
    // 对照：docs/manual/07-nightmare-cards.md 邪念瘟疫（17-20 行）
    // params: { bribedTargets: string[] }
    const bribed = new Set((_params?.bribedTargets as string[]) ?? []);
    let s = G;
    const layerThieves = [...ls.playersInLayer].filter((pid) => {
      const p = s.players[pid];
      return p && isOutwardThief(s, pid) && p.isAlive;
    });
    for (const pid of layerThieves) {
      if (!bribed.has(pid)) continue;
      const poolIdxs = inPoolBribeIndexes(s);
      if (poolIdxs.length === 0) continue;
      const pickIdx = (random.Die(poolIdxs.length) - 1) % poolIdxs.length;
      const dealt = dealBribeCard(s, pid, poolIdxs[pickIdx]!);
      if (dealt !== null) s = dealt;
    }
    // 「手里有贿赂牌」：收到过贿赂牌即算（bribeReceived 公开、不会减少；池里 heldBy 是同一信息的另一面）
    for (const pid of layerThieves) {
      const holdsBribe =
        s.players[pid]!.bribeReceived > 0 || s.bribePool.some((b) => b.heldBy === pid);
      if (!holdsBribe) s = sendToLimbo(s, pid);
    }
    return s;
  }

  if (nid === 'nightmare_hunger_bite') {
    // 该层所有玩家弃 3 张手牌；不足 3 张 → 进入迷失层（保留手牌）
    // 包含梦主
    let s = G;
    const allOnLayer = [...ls.playersInLayer];
    for (const pid of allOnLayer) {
      const p = s.players[pid];
      if (!p || !p.isAlive) continue;
      if (p.hand.length >= 3) {
        // 弃前 3 张（MVP 策略；真实应让玩家选）
        s = discardCards(s, pid, p.hand.slice(0, 3));
      } else {
        // 不足 3 张 → 入迷失层（保留手牌，不视为被梦主击杀）
        s = sendToLimbo(s, pid);
      }
    }
    return s;
  }

  // 其他梦魇待后续实现
  return INVALID_MOVE;
}
