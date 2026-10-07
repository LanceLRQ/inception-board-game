// 其余行动牌：梦魇解封、移形换影、梦境穿梭剂、KICK、念力牵引、嫁接、万有引力、共鸣、时间风暴、凭空造物。
// SHOOT 系列见 shoot.ts，解封见 unlock.ts，梦境窥视见 peek.ts。

import type { CardID } from '@icgame/shared';
import { isStringArray } from '../engine/argShape.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import { isCardForPlayMove } from '../engine/playCardKinds.js';
import {
  applyKickEffect,
  applyMercuryReverse,
  applyUranusFirmamentMoveDiscard,
  isDreamMaster,
  isMazeBlocked,
} from '../engine/skills.js';
import { discardCard, drawCards, incrementMoveCounter, movePlayerToLayer } from '../stateOps.js';
import { type MoveCtx, guardTurnPhase, isAdjacent } from './common.js';

export const actionCardMoves = {
  // 打出梦魇解封 - 翻开指定层的面朝下梦魇；后续由梦主选择发动/弃掉
  // 对照：docs/manual/04-action-cards.md 梦魇解封
  playNightmareUnlock: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID, layer: number) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playNightmareUnlock', cardId)) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.isAlive) return INVALID_MOVE;
      if (!self.hand.includes(cardId)) return INVALID_MOVE;
      const ls = G.layers[layer];
      if (!ls || !ls.nightmareId) return INVALID_MOVE;
      if (ls.nightmareRevealed) return INVALID_MOVE;

      let s = discardCard(G, ctx.currentPlayer, cardId);
      s = {
        ...s,
        layers: { ...s.layers, [layer]: { ...ls, nightmareRevealed: true } },
      };
      return incrementMoveCounter(s);
    },
    client: false,
  },

  // 移形换影（EX）：与另一位玩家交换角色牌；回合末自动还原
  // 对照：docs/manual/04-action-cards.md 移形换影
  // 约束：盗梦者不得对梦主使用；梦主对盗梦者可用；不能对自己
  playShift: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID, targetPlayerID: string) => {
      // 允许任意阶段使用（manual: 你的任意阶段）
      if (G.phase !== 'playing') return INVALID_MOVE;
      if (ctx.currentPlayer !== G.currentPlayerID) return INVALID_MOVE;
      if (!isCardForPlayMove('playShift', cardId)) return INVALID_MOVE;
      if (targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      const target = G.players[targetPlayerID];
      if (!self || !target) return INVALID_MOVE;
      if (!self.isAlive || !target.isAlive) return INVALID_MOVE;
      if (!self.hand.includes(cardId)) return INVALID_MOVE;
      // 盗梦者不能对梦主使用（但梦主对盗梦者可）；背叛者对外是盗梦者，同样不能对梦主使用
      // 对照：docs/manual/04-action-cards.md 移形换影 解析
      if (!isDreamMaster(G, ctx.currentPlayer) && isDreamMaster(G, targetPlayerID)) {
        return INVALID_MOVE;
      }

      let s = discardCard(G, ctx.currentPlayer, cardId);
      // 首次 shift 前先快照全员角色
      const snapshot: Record<string, CardID> = s.shiftSnapshot ?? {};
      if (!s.shiftSnapshot) {
        for (const pid of s.playerOrder) {
          const p = s.players[pid];
          if (p) snapshot[pid] = p.characterId;
        }
      }
      // 交换 characterId
      const selfAfter = s.players[ctx.currentPlayer]!;
      const targetAfter = s.players[targetPlayerID]!;
      s = {
        ...s,
        shiftSnapshot: snapshot,
        players: {
          ...s.players,
          [ctx.currentPlayer]: { ...selfAfter, characterId: targetAfter.characterId },
          [targetPlayerID]: { ...targetAfter, characterId: selfAfter.characterId },
        },
      };
      return incrementMoveCounter(s);
    },
    client: false,
  },

  // 打出梦境穿梭剂 - 移动到相邻层
  // 对照：docs/manual/04-action-cards.md 梦境穿梭剂
  playDreamTransit: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID, targetLayer: number) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playDreamTransit', cardId)) return INVALID_MOVE;
      const player = G.players[ctx.currentPlayer];
      if (!player || !player.isAlive) return INVALID_MOVE;
      if (!player.hand.includes(cardId)) return INVALID_MOVE;
      if (targetLayer < 1 || targetLayer > 4) return INVALID_MOVE;
      if (!isAdjacent(player.currentLayer, targetLayer)) return INVALID_MOVE;

      let s = discardCard(G, ctx.currentPlayer, cardId);
      s = movePlayerToLayer(s, ctx.currentPlayer, targetLayer);
      // 天王星·苍穹世界观：盗梦者因行动牌移动 → 牌库顶弃 1（贿赂派完弃 2）
      s = applyUranusFirmamentMoveDiscard(s, ctx.currentPlayer);
      return incrementMoveCounter(s);
    },
    client: false,
  },

  // 打出 KICK - 与目标玩家交换梦境层
  // 对照：docs/manual/04-action-cards.md KICK
  playKick: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID, targetPlayerID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playKick', cardId)) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.hand.includes(cardId)) return INVALID_MOVE;

      let s = discardCard(G, ctx.currentPlayer, cardId);
      // 水星·逆流：贿赂者对梦主出牌 → 梦主先收入
      s = applyMercuryReverse(s, ctx.currentPlayer, cardId, targetPlayerID) ?? s;
      const kicked = applyKickEffect(s, ctx.currentPlayer, targetPlayerID);
      if (kicked === null) return INVALID_MOVE;
      return incrementMoveCounter(kicked);
    },
    client: false,
  },

  // 打出念力牵引 - 把目标玩家拉到自己所在层
  // 对照：docs/manual/04-action-cards.md 念力牵引
  playTelekinesis: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID, targetPlayerID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playTelekinesis', cardId)) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      const target = G.players[targetPlayerID];
      if (!self || !target) return INVALID_MOVE;
      if (targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
      if (!self.isAlive || !target.isAlive) return INVALID_MOVE;
      if (!self.hand.includes(cardId)) return INVALID_MOVE;

      let s = discardCard(G, ctx.currentPlayer, cardId);
      const moved = target.currentLayer !== self.currentLayer;
      s = movePlayerToLayer(s, targetPlayerID, self.currentLayer);
      // 天王星·苍穹世界观：仅在 target 层数实际改变时弃
      if (moved) {
        s = applyUranusFirmamentMoveDiscard(s, targetPlayerID);
      }
      return incrementMoveCounter(s);
    },
    client: false,
  },

  // 打出嫁接 - 抽 3 张 → 从手中选 2 张放回牌库顶（两阶段）
  // 对照：docs/manual/04-action-cards.md 嫁接
  playGraft: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playGraft', cardId)) return INVALID_MOVE;
      const player = G.players[ctx.currentPlayer];
      if (!player || !player.isAlive) return INVALID_MOVE;
      if (!player.hand.includes(cardId)) return INVALID_MOVE;

      let s = discardCard(G, ctx.currentPlayer, cardId);
      s = drawCards(s, ctx.currentPlayer, 3);
      s = { ...s, pendingGraft: { playerID: ctx.currentPlayer } };
      return incrementMoveCounter(s);
    },
    client: false,
  },

  resolveGraft: {
    move: ({ G, ctx }: MoveCtx, cardsToReturn: CardID[]) => {
      if (!G.pendingGraft) return INVALID_MOVE;
      if (G.pendingGraft.playerID !== ctx.currentPlayer) return INVALID_MOVE;
      if (!Array.isArray(cardsToReturn) || cardsToReturn.length !== 2) return INVALID_MOVE;
      const player = G.players[ctx.currentPlayer];
      if (!player) return INVALID_MOVE;

      // 两张必须都在手中（允许重复卡面，但两个 index 不同）
      const newHand = [...player.hand];
      for (const cardId of cardsToReturn) {
        const idx = newHand.indexOf(cardId);
        if (idx === -1) return INVALID_MOVE;
        newHand.splice(idx, 1);
      }

      return {
        ...G,
        players: {
          ...G.players,
          [ctx.currentPlayer]: { ...player, hand: newHand },
        },
        deck: {
          ...G.deck,
          // 按指定顺序放回牌库顶：cardsToReturn[0] 在最顶
          cards: [...cardsToReturn, ...G.deck.cards],
        },
        pendingGraft: null,
      };
    },
    client: false,
  },

  // 打出万有引力 - 指定 1-2 个目标；所有目标手牌入池，从 bonder 起按 playOrder 轮流挑选
  // 对照：docs/manual/04-action-cards.md 万有引力
  playGravity: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID, targetIds: string[]) => {
      if (!isStringArray(targetIds)) return INVALID_MOVE;
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playGravity', cardId)) return INVALID_MOVE;
      for (const tid of targetIds) {
        if (isMazeBlocked(G, tid, 'playGravity')) return INVALID_MOVE;
      }
      if (!Array.isArray(targetIds) || targetIds.length < 1 || targetIds.length > 2) {
        return INVALID_MOVE;
      }
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.isAlive) return INVALID_MOVE;
      if (!self.hand.includes(cardId)) return INVALID_MOVE;
      // 目标：必须都存在 + 不能含自己 + 不能重复
      const seen = new Set<string>();
      for (const t of targetIds) {
        if (t === ctx.currentPlayer) return INVALID_MOVE;
        if (seen.has(t)) return INVALID_MOVE;
        seen.add(t);
        const tp = G.players[t];
        if (!tp || !tp.isAlive) return INVALID_MOVE;
      }

      // 弃掉该牌
      let s = discardCard(G, ctx.currentPlayer, cardId);

      // pickOrder = [bonder, ...targetIds 按 playOrder 排序]
      const orderIdxMap = new Map<string, number>();
      G.playerOrder.forEach((pid, i) => orderIdxMap.set(pid, i));
      const sortedTargets = [...targetIds].sort(
        (a, b) => (orderIdxMap.get(a) ?? 0) - (orderIdxMap.get(b) ?? 0),
      );
      const pickOrder = [ctx.currentPlayer, ...sortedTargets];

      // 按排序后目标顺序收集 target 手牌入 pool，清空 target 手牌
      const pool: CardID[] = [];
      const nextPlayers = { ...s.players };
      for (const t of sortedTargets) {
        const tp = nextPlayers[t]!;
        pool.push(...tp.hand);
        nextPlayers[t] = { ...tp, hand: [] };
      }

      s = {
        ...s,
        players: nextPlayers,
        pendingGravity:
          pool.length === 0
            ? null // 池为空直接跳过
            : {
                bonderPlayerID: ctx.currentPlayer,
                targetIds: sortedTargets,
                pool,
                pickOrder,
                pickCursor: 0,
              },
      };
      return incrementMoveCounter(s);
    },
    client: false,
  },

  // 万有引力挑选（picker 从 pool 选 1 张）
  // MVP 简化：由 bonder 的客户端代理所有 picker 调用（BGIO stages 未启用）
  resolveGravityPick: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
      const pg = G.pendingGravity;
      if (!pg) return INVALID_MOVE;
      // 仅 bonder 可驱动（MVP），实际 picker 由 pickOrder[cursor] 决定
      if (ctx.currentPlayer !== pg.bonderPlayerID) return INVALID_MOVE;
      const picker = pg.pickOrder[pg.pickCursor % pg.pickOrder.length];
      if (!picker) return INVALID_MOVE;
      const poolIdx = pg.pool.indexOf(cardId);
      if (poolIdx === -1) return INVALID_MOVE;
      const pickerPlayer = G.players[picker];
      if (!pickerPlayer) return INVALID_MOVE;

      const newPool = [...pg.pool];
      newPool.splice(poolIdx, 1);
      const nextCursor = (pg.pickCursor + 1) % pg.pickOrder.length;

      return {
        ...G,
        players: {
          ...G.players,
          [picker]: { ...pickerPlayer, hand: [...pickerPlayer.hand, cardId] },
        },
        pendingGravity:
          newPool.length === 0 ? null : { ...pg, pool: newPool, pickCursor: nextCursor },
      };
    },
    client: false,
  },

  // 打出共鸣 - 获取目标全部手牌，回合末归还己手牌（除非目标入迷失层/死亡）
  // 对照：docs/manual/04-action-cards.md 共鸣
  playResonance: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID, targetPlayerID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playResonance', cardId)) return INVALID_MOVE;
      if (isMazeBlocked(G, targetPlayerID, 'playResonance')) return INVALID_MOVE;
      // 每回合限 1 张
      if (G.pendingResonance) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      const target = G.players[targetPlayerID];
      if (!self || !target) return INVALID_MOVE;
      if (targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
      if (!self.isAlive || !target.isAlive) return INVALID_MOVE;
      if (!self.hand.includes(cardId)) return INVALID_MOVE;

      // 先把共鸣本身从手牌移除并入弃牌堆
      let s = discardCard(G, ctx.currentPlayer, cardId);
      // 把 target 全部手牌转给 self
      const targetHand = [...(s.players[targetPlayerID]?.hand ?? [])];
      const selfAfter = s.players[ctx.currentPlayer]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [targetPlayerID]: { ...s.players[targetPlayerID]!, hand: [] },
          [ctx.currentPlayer]: {
            ...selfAfter,
            hand: [...selfAfter.hand, ...targetHand],
          },
        },
        pendingResonance: {
          bonderPlayerID: ctx.currentPlayer,
          targetPlayerID,
        },
      };
      return incrementMoveCounter(s);
    },
    client: false,
  },

  // 打出时间风暴 - 从牌库顶弃掉 10 张牌，本牌移出游戏
  // 对照：docs/manual/04-action-cards.md 时间风暴
  // 规则：使用或弃掉时都触发效果；被弃掉的 10 张进弃牌堆，只有时间风暴自己移出游戏
  playTimeStorm: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const player = G.players[ctx.currentPlayer];
      if (!player || !player.isAlive) return INVALID_MOVE;
      if (!isCardForPlayMove('playTimeStorm', cardId)) return INVALID_MOVE;
      if (!player.hand.includes(cardId)) return INVALID_MOVE;

      // 打出与弃掉走同一个入口：牌库顶 10 张进弃牌堆，时间风暴自己移出游戏
      return incrementMoveCounter(discardCard(G, ctx.currentPlayer, cardId));
    },
    client: false,
  },

  // 打出凭空造物 - 从牌库顶抽2张牌
  // 对照：docs/manual/04-action-cards.md 凭空造物
  playCreation: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!isCardForPlayMove('playCreation', cardId)) return INVALID_MOVE;
      const player = G.players[ctx.currentPlayer];
      if (!player || !player.isAlive) return INVALID_MOVE;
      if (!player.hand.includes(cardId)) return INVALID_MOVE;

      let s = discardCard(G, ctx.currentPlayer, cardId);
      s = drawCards(s, ctx.currentPlayer, 2);
      return incrementMoveCounter(s);
    },
    client: false,
  },
};
