// 梦主的行动与梦魇：梦主移动、弃掉或发动已翻开的梦魇、金币金库打开后的三选一。

import { INVALID_MOVE } from '../engine/invalidMove.js';
import { dealBribeCard, discardNightmareOnLayer, isOutwardThief } from '../engine/skills.js';
import type { SetupState, VaultDecisionChoice } from '../setup.js';
import { incrementMoveCounter, movePlayerToLayer } from '../stateOps.js';
import { type MoveCtx, guardTurnPhase, isAdjacent } from './common.js';
import { activateNightmareOnLayer } from './nightmareEffects.js';
import { resolveBribePick } from './settlement.js';

export const masterMoves = {
  dreamMasterMove: {
    move: ({ G, ctx }: MoveCtx, targetLayer: number) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      if (!isAdjacent(G.players[ctx.currentPlayer]!.currentLayer, targetLayer)) {
        return INVALID_MOVE;
      }
      return incrementMoveCounter(movePlayerToLayer(G, ctx.currentPlayer, targetLayer));
    },
    client: false,
  },

  // --- 梦魇系统（梦主限定）---
  // 对照：docs/manual/07-nightmare-cards.md
  // 梦魇牌只在盗梦者打开金币金库（masterVaultDecision）时、以及被技能或行动牌翻开后才发动；
  // 梦主不能在自己回合随意翻开或弃掉未翻开的梦魇。下面两个 move 只处理「已被翻开」的梦魇。
  // 对照：docs/manual/03-game-flow.md 梦魇牌（94-103 行）
  // 梦主弃掉已翻开的梦魇（不发动效果）
  masterDiscardNightmare: {
    move: ({ G, ctx }: MoveCtx, layer: number) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const ls = G.layers[layer];
      if (!ls || !ls.nightmareId || !ls.nightmareRevealed) return INVALID_MOVE;
      return discardNightmareOnLayer(G, layer);
    },
    client: false,
  },

  // 梦主发动已翻开的梦魇效果
  // 对照：docs/manual/07-nightmare-cards.md
  masterActivateNightmare: {
    move: ({ G, ctx, random }: MoveCtx, layer: number, params?: Record<string, unknown>) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const ls = G.layers[layer];
      if (!ls || !ls.nightmareId || !ls.nightmareRevealed) return INVALID_MOVE;
      return activateNightmareOnLayer(G, layer, random, params);
    },
    client: false,
  },

  // 贿赂牌只在金币金库打开（masterVaultDecision）与【梦境窥视】效果①（peek.ts 的 masterPeekBribeDecision）
  // 时派发，梦主不能在自己回合随意派。
  // 对照：docs/manual/03-game-flow.md 贿赂&背叛者（38-45 行）

  // 金币金库打开后，梦主在三项里选一项（回合外 move，不 guard turnPhase）
  // 对照：docs/manual/03-game-flow.md 金库（33-36 行）、梦魇牌（94-103 行）
  //   'bribe'    ：随机派 1 张贿赂牌给打开者（迷失层也派），并弃掉该层梦魇（不发动）；
  //                皇城·重金可以用 params.poolIndex 指定池里的 1 张
  //   'nightmare'：翻开并发动该层梦魇（params 透传给梦魇效果），不派贿赂牌
  //   'discard'  ：弃掉该层梦魇，不派贿赂牌；该层没有梦魇时什么都不弃
  //   三个分支都清掉等待状态；梦魇效果不合法时整个 move 非法、等待状态保留
  masterVaultDecision: {
    move: (
      { G, ctx, random }: MoveCtx,
      choice: VaultDecisionChoice,
      params?: Record<string, unknown>,
    ) => {
      const pending = G.pendingVaultDecision;
      if (!pending) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
      const { layer, openerID } = pending;

      let s: SetupState;
      if (choice === 'bribe') {
        // 贿赂牌只派给对外是盗梦者的人（含背叛者），梦主不能派给自己
        if (!isOutwardThief(G, openerID)) return INVALID_MOVE;
        const pick = resolveBribePick(G, random, params?.poolIndex);
        if (pick === null || pick === 'invalid') return INVALID_MOVE;
        const dealt = dealBribeCard(G, openerID, pick);
        if (dealt === null) return INVALID_MOVE;
        s = discardNightmareOnLayer(dealt, layer);
      } else if (choice === 'nightmare') {
        const activated = activateNightmareOnLayer(G, layer, random, params);
        if (activated === INVALID_MOVE) return INVALID_MOVE;
        s = activated;
      } else if (choice === 'discard') {
        s = discardNightmareOnLayer(G, layer);
      } else {
        return INVALID_MOVE;
      }
      return incrementMoveCounter({ ...s, pendingVaultDecision: null });
    },
    client: false,
  },
};
