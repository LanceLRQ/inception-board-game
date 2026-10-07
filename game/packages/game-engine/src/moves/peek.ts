// 梦境窥视：盗梦者效果①、梦主的派贿赂决定、梦主效果②与查看确认。

import type { CardID } from '@icgame/shared';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import { isCardForPlayMove } from '../engine/playCardKinds.js';
import { dealBribeCard, isDreamMaster, isOutwardThief } from '../engine/skills.js';
import type { SetupState } from '../setup.js';
import { discardCard, incrementMoveCounter, recordCardPlayed } from '../stateOps.js';
import { type MoveCtx, guardTurnPhase } from './common.js';
import { resolveBribePick } from './settlement.js';

export const peekMoves = {
  // 打出梦境窥视 · 效果①（盗梦者使用）
  // 对照：docs/manual/04-action-cards.md 梦境窥视 · 解析
  //   三段式：playPeek → [梦主决策是否派贿赂] → [盗梦者私密查看金库]
  //   改 MVP 占位为完整三段式。贿赂池有可派牌 → 挂 pendingPeekDecision；
  //             贿赂池已派完（无 inPool）→ 跳过决策，直接挂 peekReveal（无负担窥视）。
  playPeek: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID, targetLayer: number) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playPeek', cardId)) return INVALID_MOVE;
      const player = G.players[ctx.currentPlayer];
      if (!player || !player.isAlive) return INVALID_MOVE;
      // 效果①仅盗梦者（背叛者对外是盗梦者）；梦主效果②通过独立 move 处理
      if (isDreamMaster(G, ctx.currentPlayer)) return INVALID_MOVE;
      if (!player.hand.includes(cardId)) return INVALID_MOVE;
      if (targetLayer < 1 || targetLayer > 4) return INVALID_MOVE;
      const hasVault = G.vaults.some((v) => v.layer === targetLayer);
      if (!hasVault) return INVALID_MOVE;

      let s = discardCard(G, ctx.currentPlayer, cardId);
      const hasInPoolBribe = s.bribePool.some((b) => b.status === 'inPool');
      if (hasInPoolBribe) {
        // 挂起等梦主 masterPeekBribeDecision 决策
        s = {
          ...s,
          pendingPeekDecision: { peekerID: ctx.currentPlayer, targetLayer },
        };
      } else {
        // 无负担窥视：直接挂 peekReveal
        s = {
          ...s,
          peekReveal: {
            peekerID: ctx.currentPlayer,
            revealKind: 'vault' as const,
            vaultLayer: targetLayer,
          },
        };
      }
      return recordCardPlayed(s, cardId);
    },
    client: false,
  },

  // 梦主决策是否派 1 张贿赂给窥视者（回合外 move，不 guard turnPhase）
  // 对照：docs/manual/04-action-cards.md 梦境窥视 · 解析
  //   "梦主先决定是否让该盗梦者抽取 1 张贿赂牌，然后该盗梦者再查看任意一层梦境的金库"
  //   deal=true 随机派 1 张（命中 DEAL 转阵营）；deal=false 或 inPool=0 → 跳过派发。
  //   皇城·重金：派发时可以用 poolIndex 指定池里的 1 张，替代随机抽取。
  //   两分支终态一致：清 pendingPeekDecision + 挂 peekReveal（由 peeker 通过 peekerAcknowledge 消费）。
  masterPeekBribeDecision: {
    move: ({ G, ctx, random }: MoveCtx, deal: boolean, poolIndex?: number) => {
      if (!G.pendingPeekDecision) return INVALID_MOVE;
      // 回合外响应 move：只有梦主能发
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const { peekerID, targetLayer } = G.pendingPeekDecision;
      if (!G.players[peekerID]) return INVALID_MOVE;

      let s: SetupState = G;
      if (deal) {
        const pick = resolveBribePick(G, random, poolIndex);
        if (pick === 'invalid') return INVALID_MOVE;
        // 池里已经没有可派的牌（竞态）：当作跳过处理，不改 bribePool / bribeReceived
        if (pick !== null) {
          const dealt = dealBribeCard(G, peekerID, pick);
          if (dealt === null) return INVALID_MOVE;
          s = dealt;
        }
      }
      // 清 pending + 挂 peekReveal（peeker 私密查看）
      return {
        ...s,
        pendingPeekDecision: null,
        peekReveal: {
          peekerID,
          revealKind: 'vault' as const,
          vaultLayer: targetLayer,
        },
      };
    },
    client: false,
  },

  // 打出梦境窥视 · 效果②（梦主使用）
  // 对照：docs/manual/04-action-cards.md 梦境窥视 效果②
  //   "仅梦主使用，查看一名盗梦者的所有贿赂牌。"
  //   使用目标："一名已被贿赂的盗梦者"
  //   梦主对一名已被贿赂的盗梦者打出此牌，弃牌后挂 peekReveal.bribe；
  //              peeker=梦主自己；由 peekerAcknowledge 清理（复用）。
  playPeekMaster: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID, targetThiefID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playPeekMaster', cardId)) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const master = G.players[ctx.currentPlayer];
      if (!master || !master.isAlive) return INVALID_MOVE;
      if (!master.hand.includes(cardId)) return INVALID_MOVE;
      // 目标校验：target 存在 / 非梦主自身 / 在世 / 盗梦者阵营 / 已持贿赂
      if (targetThiefID === ctx.currentPlayer) return INVALID_MOVE;
      const target = G.players[targetThiefID];
      if (!target || !target.isAlive) return INVALID_MOVE;
      if (!isOutwardThief(G, targetThiefID)) return INVALID_MOVE;
      const hasBribe = G.bribePool.some((b) => b.heldBy === targetThiefID);
      if (!hasBribe) return INVALID_MOVE;

      let s = discardCard(G, ctx.currentPlayer, cardId);
      s = {
        ...s,
        peekReveal: {
          peekerID: ctx.currentPlayer,
          revealKind: 'bribe',
          targetThiefID,
        },
      };
      return recordCardPlayed(s, cardId);
    },
    client: false,
  },

  // 盗梦者确认查看完毕 → 清 peekReveal + moveCounter+1
  //   必须由 peekerID 本人调用。
  //   对 revealKind='bribe' 分支同样适用（peeker=梦主）。
  peekerAcknowledge: {
    move: ({ G, ctx }: MoveCtx) => {
      if (!G.peekReveal) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.peekReveal.peekerID) return INVALID_MOVE;
      const s: SetupState = { ...G, peekReveal: null };
      return incrementMoveCounter(s);
    },
    client: false,
  },
};
