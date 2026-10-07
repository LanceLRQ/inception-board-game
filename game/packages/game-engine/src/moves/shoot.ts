// SHOOT 系列出牌：普通 SHOOT 与四种变体（梦境穿梭剂、刺客之王、爆甲螺旋、炸裂弹头），
// 以及发动方选择目标移动到哪一层。共同的结算在 shootResolution.ts。

import type { CardID } from '@icgame/shared';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import { isCardForPlayMove } from '../engine/playCardKinds.js';
import type { SetupState } from '../setup.js';
import {
  discardCard,
  incrementMoveCounter,
  movePlayerToLayer,
  recordCardPlayed,
} from '../stateOps.js';
import { type MoveCtx, guardTurnPhase, isAdjacent } from './common.js';
import { applyShootVariant } from './shootResolution.js';

export const shootMoves = {
  playShoot: {
    move: (
      { G, ctx, random }: MoveCtx,
      targetPlayerID: string,
      cardId: CardID,
      decreeId?: CardID,
      preventMove?: boolean,
    ) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playShoot', cardId)) return INVALID_MOVE;
      // 射手·禁足：仅射手角色可阻止移动
      const shooter = G.players[ctx.currentPlayer];
      const canPrevent = preventMove && shooter?.characterId === 'thief_sagittarius';
      const r = applyShootVariant(G, ctx, random, targetPlayerID, cardId, {
        sameLayerRequired: true,
        deathFaces: [1],
        moveFaces: [2, 3, 4],
        extraOnMove: null,
        decreeId,
        preventMove: canPrevent,
      });
      return r === INVALID_MOVE ? r : recordCardPlayed(r, cardId);
    },
    client: false,
  },

  // SHOOT·梦境穿梭剂：同时视为 SHOOT 和 梦境穿梭剂；使用者选择结算方式
  // 对照：docs/manual/04-action-cards.md SHOOT·梦境穿梭剂
  // mode='shoot'  → 同 playShoot（base 骰面 [1] 死 [2-4] 移）
  // mode='transit' → 自己移动到相邻层（同 playDreamTransit）
  playShootDreamTransit: {
    move: (
      { G, ctx, random }: MoveCtx,
      cardId: CardID,
      mode: 'shoot' | 'transit',
      targetOrLayer: string | number,
      decreeId?: CardID,
    ) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playShootDreamTransit', cardId)) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.isAlive) return INVALID_MOVE;
      if (!self.hand.includes(cardId)) return INVALID_MOVE;

      if (mode === 'shoot') {
        // 目标为玩家 ID
        if (typeof targetOrLayer !== 'string') return INVALID_MOVE;
        const r = applyShootVariant(G, ctx, random, targetOrLayer, cardId, {
          sameLayerRequired: true,
          deathFaces: [1],
          moveFaces: [2, 3, 4],
          extraOnMove: null,
          decreeId,
        });
        return r === INVALID_MOVE ? r : recordCardPlayed(r, cardId);
      } else if (mode === 'transit') {
        // 自己移动到相邻层
        if (typeof targetOrLayer !== 'number') return INVALID_MOVE;
        if (!isAdjacent(self.currentLayer, targetOrLayer)) return INVALID_MOVE;
        let s = discardCard(G, ctx.currentPlayer, cardId);
        s = movePlayerToLayer(s, ctx.currentPlayer, targetOrLayer);
        return incrementMoveCounter(s);
      }
      return INVALID_MOVE;
    },
    client: false,
  },

  // SHOOT·刺客之王：目标任意层；[1/2] 死亡 [3/4/5] 移动相邻层
  // 对照：docs/manual/04-action-cards.md SHOOT·刺客之王
  playShootKing: {
    move: (
      { G, ctx, random }: MoveCtx,
      targetPlayerID: string,
      cardId: CardID,
      decreeId?: CardID,
    ) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playShootKing', cardId)) return INVALID_MOVE;
      return applyShootVariant(G, ctx, random, targetPlayerID, cardId, {
        sameLayerRequired: false,
        deathFaces: [1, 2],
        moveFaces: [3, 4, 5],
        extraOnMove: null,
        decreeId,
      });
    },
    client: false,
  },

  // SHOOT·爆甲螺旋：同层；[1/2] 死 [3/4/5] 弃 target 所有解封 + 移动
  playShootArmor: {
    move: (
      { G, ctx, random }: MoveCtx,
      targetPlayerID: string,
      cardId: CardID,
      decreeId?: CardID,
    ) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playShootArmor', cardId)) return INVALID_MOVE;
      return applyShootVariant(G, ctx, random, targetPlayerID, cardId, {
        sameLayerRequired: true,
        deathFaces: [1, 2],
        moveFaces: [3, 4, 5],
        extraOnMove: 'discard_unlocks',
        decreeId,
      });
    },
    client: false,
  },

  // SHOOT·炸裂弹头：同层；[1/2] 死 [3/4/5] 弃 target 所有 SHOOT 类 + 移动
  playShootBurst: {
    move: (
      { G, ctx, random }: MoveCtx,
      targetPlayerID: string,
      cardId: CardID,
      decreeId?: CardID,
    ) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playShootBurst', cardId)) return INVALID_MOVE;
      return applyShootVariant(G, ctx, random, targetPlayerID, cardId, {
        sameLayerRequired: true,
        deathFaces: [1, 2],
        moveFaces: [3, 4, 5],
        extraOnMove: 'discard_shoots',
        decreeId,
      });
    },
    client: false,
  },

  // SHOOT 结算判定 move 后的"发动方选层"响应：L2/L3 目标由发动方选相邻层
  //   对照：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
  //   生命周期：applyShootVariant 挂起 pendingShootMove → 本 move 消费
  //   仅 shooterID 可消费（非当前回合玩家也能操作，因 SHOOT 发动可能跨 turnPhase 时机；故不 guard turnPhase）
  resolveShootMove: {
    move: ({ G, ctx }: MoveCtx, layer: number) => {
      const p = G.pendingShootMove;
      if (!p) return INVALID_MOVE;
      if (ctx.currentPlayer !== p.shooterID) return INVALID_MOVE;
      if (!Number.isInteger(layer) || !p.choices.includes(layer)) return INVALID_MOVE;
      let s: SetupState = movePlayerToLayer(G, p.targetPlayerID, layer);
      s = { ...s, pendingShootMove: null };
      // 命中「移动」的点数不会是 6，处女·完美不会在这里触发
      return incrementMoveCounter(s);
    },
    client: false,
  },
};
