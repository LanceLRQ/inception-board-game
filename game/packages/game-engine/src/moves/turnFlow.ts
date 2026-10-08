// 回合流程：抽牌、行动、弃牌三个阶段的推进，以及出牌阶段的复活。
// 回合的开始与结束钩子见 ../turnHooks.ts。

import type { CardID } from '@icgame/shared';
import { isStringArray } from '../engine/argShape.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import {
  getDiscardRequired,
  getTurnDrawCount,
  isForcedFullDiscard,
  needsPlutoHellRoll,
} from '../engine/limits.js';
import {
  applyLeoKingdom,
  applyPointmanAssault,
  applyRevive,
  endDrawPhase,
  isValidAriesExtraChoice,
  settleAriesExtraDraw,
  settleBlackHoleReverse,
} from '../engine/skills.js';
import { discardToLimit, drawCards, incrementMoveCounter, setTurnPhase } from '../stateOps.js';
import { type MoveCtx, guardTurnPhase } from './common.js';

export const turnFlowMoves = {
  // ariesExtra：白羊·闪耀多抽的张数（0 到已弃梦魇数），只有存活的白羊可以带；不带则抽满
  doDraw: {
    move: ({ G, ctx, random }: MoveCtx, ariesExtra?: number | null) => {
      if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
      if (!isValidAriesExtraChoice(G, G.currentPlayerID, ariesExtra)) return INVALID_MOVE;
      // 抽牌前后对比推出 drawnCards（用于先锋技能触发）
      const beforeHand = G.players[G.currentPlayerID]?.hand ?? [];
      // 冥王星地狱世界观：盗梦者抽牌数 = 1 颗骰子结果；只有这时才掷骰
      // 其余加成（盛夏、巨蟹·气场）与总数的计算见 engine/limits.ts
      const plutoRoll = needsPlutoHellRoll(G, G.currentPlayerID) ? random.D6() : null;
      const totalDraw = getTurnDrawCount(G, G.currentPlayerID, plutoRoll);
      let s = drawCards(G, G.currentPlayerID, totalDraw);
      const afterHand = s.players[G.currentPlayerID]?.hand ?? [];
      const drawn = afterHand.slice(beforeHand.length);
      // 先锋技能：抽到 action_dream_transit 则额外抽 2 张
      s = applyPointmanAssault(s, G.currentPlayerID, drawn);
      // 狮子王道：抽完后从牌库顶额外抽 = 梦主手牌数
      s = applyLeoKingdom(s, G.currentPlayerID);
      // 白羊·闪耀：抽牌阶段按白羊自己选的张数额外抽牌
      s = settleAriesExtraDraw(s, ariesExtra);
      // 黑洞·倒流：梦主自己的抽牌阶段恢复心锁
      s = settleBlackHoleReverse(s);
      s = endDrawPhase(s);
      return s;
    },
    client: false,
  },

  skipDraw: {
    move: ({ G, ctx }: MoveCtx) => {
      if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
      // 略过抽牌仍经过抽牌阶段：黑洞·倒流照常恢复心锁（对照：docs/manual/06-dream-master.md 黑洞 133 行）
      return endDrawPhase(settleBlackHoleReverse(G));
    },
    client: false,
  },

  endActionPhase: {
    move: ({ G, ctx }: MoveCtx) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      // 共鸣归还：弃牌阶段前将 bonder 的全部手牌给予 target
      // 若 target 已进入迷失层（layer 0）或死亡则保留手牌
      // 对照：docs/manual/04-action-cards.md 共鸣 解析
      let s = G;
      if (s.pendingResonance && s.pendingResonance.bonderPlayerID === ctx.currentPlayer) {
        const { bonderPlayerID, targetPlayerID } = s.pendingResonance;
        const bonder = s.players[bonderPlayerID];
        const target = s.players[targetPlayerID];
        if (bonder && target) {
          const targetInLost = target.currentLayer === 0 || !target.isAlive;
          if (!targetInLost && bonder.hand.length > 0) {
            s = {
              ...s,
              players: {
                ...s.players,
                [bonderPlayerID]: { ...bonder, hand: [] },
                [targetPlayerID]: {
                  ...target,
                  hand: [...target.hand, ...bonder.hand],
                },
              },
            };
          }
        }
        s = { ...s, pendingResonance: null };
      }
      s = setTurnPhase(s, 'discard');
      return s;
    },
    client: false,
  },

  // 复活：出牌阶段弃 2 张手牌复活自己或他人（密道世界观：弃 1 张穿梭剂）
  // 对照：docs/manual/03-game-flow.md 复活 / docs/manual/06-dream-master.md 密道
  playRevive: {
    move: ({ G, ctx }: MoveCtx, targetID: string | null, discardedCardIds: CardID[]) => {
      if (!isStringArray(discardedCardIds)) return INVALID_MOVE;
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const applied = applyRevive(G, ctx.currentPlayer, targetID, discardedCardIds);
      if (applied === null) return INVALID_MOVE;
      return incrementMoveCounter(applied);
    },
    client: false,
  },

  doDiscard: {
    move: ({ G, ctx, events }: MoveCtx, cardIds: CardID[]) => {
      if (!isStringArray(cardIds)) return INVALID_MOVE;
      if (!guardTurnPhase(G, ctx, 'discard')) return INVALID_MOVE;
      const player = G.players[ctx.currentPlayer];
      // 小丑·失控罚则：发动失控的当回合弃牌阶段必须弃光手牌（armedAtTurn === turnNumber）
      // 对照：docs/manual/05-dream-thieves.md 小丑「则你在弃牌阶段必须弃掉所有手牌」
      const forced = !!player && isForcedFullDiscard(G, ctx.currentPlayer);
      if (forced) {
        // 必须一次性弃掉全部手牌，否则拒绝
        if (cardIds.length !== player!.hand.length) return INVALID_MOVE;
      }
      // 每张要弃的牌都必须在手里（同一张写两次要求手里有两张）
      if (!player) return INVALID_MOVE;
      const remainingHand = [...player.hand];
      for (const c of cardIds) {
        const idx = remainingHand.indexOf(c);
        if (idx === -1) return INVALID_MOVE;
        remainingHand.splice(idx, 1);
      }
      // 弃的张数不得少于必须弃的张数（弃完须不超手牌上限；巨蟹·庇佑生效时不限，与 skipDiscard 一致）
      if (cardIds.length < getDiscardRequired(G, ctx.currentPlayer)) return INVALID_MOVE;
      let next = discardToLimit(G, ctx.currentPlayer, cardIds);
      if (forced) {
        next = {
          ...next,
          players: {
            ...next.players,
            [ctx.currentPlayer]: {
              ...next.players[ctx.currentPlayer]!,
              forcedDiscardArmedAtTurn: null,
            },
          },
        };
      }
      // 弃牌完成 → 切下一回合
      events.endTurn();
      return next;
    },
    client: false,
  },

  skipDiscard: {
    move: ({ G, ctx, events }: MoveCtx) => {
      if (!guardTurnPhase(G, ctx, 'discard')) return INVALID_MOVE;
      // 没有必须弃的牌才允许跳过：手牌未超限（巨蟹·庇佑之下无上限），
      // 且没有待执行的小丑·失控罚则（当回合发动过且手里还有牌 → 必须走 doDiscard 全弃）
      // 对照：docs/manual/05-dream-thieves.md 巨蟹「庇佑」、小丑「失控」
      const player = G.players[ctx.currentPlayer];
      if (getDiscardRequired(G, ctx.currentPlayer) > 0) return INVALID_MOVE;
      const armed = !!player && isForcedFullDiscard(G, ctx.currentPlayer);
      events.endTurn();
      if (!armed) return G;
      return {
        ...G,
        players: {
          ...G.players,
          [ctx.currentPlayer]: { ...player!, forcedDiscardArmedAtTurn: null },
        },
      };
    },
    client: false,
  },
};
