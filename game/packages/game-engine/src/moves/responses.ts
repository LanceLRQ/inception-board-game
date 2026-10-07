// 结算过程中的应答：被 SHOOT 时的双鱼·闪避与恐怖分子·狂热、处女·完美三选一、白羊·星尘。
// 这些 move 由被点名的玩家在回合外发起，行动权见 engine/actionRights.ts。

import type { CardID } from '@icgame/shared';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import {
  type VirgoPerfectChoice,
  applyAriesStardustDiscard,
  applyAriesStardustReveal,
  applyPiscesEvade,
  applyVirgoDrawTwo,
  applyVirgoResurrect,
  applyVirgoTeleport,
  canPiscesEvade,
} from '../engine/skills.js';
import type { SetupState } from '../setup.js';
import { discardCard, incrementMoveCounter } from '../stateOps.js';
import type { MoveCtx } from './common.js';
import { applyNightmareEffect } from './nightmareEffects.js';
import { resumeShootAfterResponse } from './shootResolution.js';

export const responseMoves = {
  // 双鱼·闪避（skill_0）· SHOOT 响应窗口
  //   pendingShootResponse 由 applyShootVariant 在 pre-roll 阶段挂起；本 move 由目标双鱼消费
  //   evade 分支：移到 currentLayer-1 + 翻面 + 弃 SHOOT 卡
  //   pass 分支：放弃响应 → 重入 applyShootVariant（skipPiscesCheck=true）继续骰
  // 仅 pendingShootResponse.targetPlayerID 本人可发起；回合外 move 不 guard turnPhase
  respondShootEvade: {
    move: ({ G, ctx, random }: MoveCtx) => {
      if (G.phase !== 'playing') return INVALID_MOVE;
      const pending = G.pendingShootResponse;
      if (!pending) return INVALID_MOVE;
      // 仅 Pisces 响应类型可消费
      if (pending.responseType && pending.responseType !== 'pisces') return INVALID_MOVE;
      if (ctx.currentPlayer !== pending.targetPlayerID) return INVALID_MOVE;
      const target = G.players[pending.targetPlayerID];
      if (!target || !canPiscesEvade(target)) return INVALID_MOVE;

      // 1) 执行闪避（移层 + 翻面 + 标记技能已用）
      let s = applyPiscesEvade(G, pending.targetPlayerID);
      if (s === null) return INVALID_MOVE;
      // 2) shooter 弃 SHOOT 卡（避免免费再用）
      s = discardCard(s, pending.shooterID, pending.cardId);
      // 3) 清空 pending；躲开没有掷骰，处女·完美不触发
      s = { ...s, pendingShootResponse: null };
      // void random 防止未使用警告（保持签名一致）
      void random;
      return incrementMoveCounter(s);
    },
    client: false,
  },

  respondShootPass: {
    move: ({ G, ctx, random }: MoveCtx) => {
      if (G.phase !== 'playing') return INVALID_MOVE;
      const pending = G.pendingShootResponse;
      if (!pending) return INVALID_MOVE;
      // 仅 Pisces 响应类型可消费
      if (pending.responseType && pending.responseType !== 'pisces') return INVALID_MOVE;
      if (ctx.currentPlayer !== pending.targetPlayerID) return INVALID_MOVE;

      // 重入 applyShootVariant：复用原 SHOOT 参数 + skipPiscesCheck=true
      // Terrorist 检查仍可触发（如 Pisces 同时被 Terrorist SHOOT，pass 后进入 Terrorist 窗）
      const cleared = { ...G, pendingShootResponse: null };
      return resumeShootAfterResponse(cleared, ctx, random, pending, { skipPiscesCheck: true });
    },
    client: false,
  },

  // 恐怖分子·狂热（skill_1）· SHOOT 响应窗口
  //   pendingShootResponse.responseType='terrorist' 由 applyShootVariant 挂起
  //   discard 分支：target 弃 1 张手牌 → 重入 SHOOT（无 -1 惩罚）
  //   accept 分支：target 拒绝弃牌 → 重入 SHOOT（terroristPenalty=true，骰 -1）
  // 对照：docs/manual/05-dream-thieves.md 恐怖分子 狂热 247 行
  respondTerroristDiscard: {
    move: ({ G, ctx, random }: MoveCtx, cardId: CardID) => {
      if (G.phase !== 'playing') return INVALID_MOVE;
      const pending = G.pendingShootResponse;
      if (!pending) return INVALID_MOVE;
      if (pending.responseType !== 'terrorist') return INVALID_MOVE;
      if (ctx.currentPlayer !== pending.targetPlayerID) return INVALID_MOVE;
      const target = G.players[pending.targetPlayerID];
      if (!target) return INVALID_MOVE;
      // 校验 cardId 在 target 手中
      if (!target.hand.includes(cardId)) return INVALID_MOVE;

      // 1) target 弃 1 张
      let s = discardCard(G, pending.targetPlayerID, cardId);
      // 2) 清空 pending + 重入 SHOOT（无惩罚）
      s = { ...s, pendingShootResponse: null };
      return resumeShootAfterResponse(s, ctx, random, pending, {
        skipPiscesCheck: true,
        skipTerroristCheck: true,
        terroristPenalty: false,
      });
    },
    client: false,
  },

  respondTerroristAccept: {
    move: ({ G, ctx, random }: MoveCtx) => {
      if (G.phase !== 'playing') return INVALID_MOVE;
      const pending = G.pendingShootResponse;
      if (!pending) return INVALID_MOVE;
      if (pending.responseType !== 'terrorist') return INVALID_MOVE;
      if (ctx.currentPlayer !== pending.targetPlayerID) return INVALID_MOVE;

      // 清空 pending + 重入 SHOOT（terroristPenalty=true）
      const cleared = { ...G, pendingShootResponse: null };
      return resumeShootAfterResponse(cleared, ctx, random, pending, {
        skipPiscesCheck: true,
        skipTerroristCheck: true,
        terroristPenalty: true,
      });
    },
    client: false,
  },

  // 处女·完美（skill_0）· 三选一响应窗
  // 对照：docs/manual/05-dream-thieves.md 处女
  // 触发：settleVirgoPerfect 在本次 SHOOT 的最终结算点数为 6 时挂起 pendingVirgoChoice
  // 约束：
  //   - 仅 pendingVirgoChoice.virgoID 本人可发起（回合外 move，不 guard turnPhase）
  //   - choice='revive' 需 targetID 参数（己方死亡角色）
  //   - choice='draw_two' 无参
  //   - choice='teleport' 需 layer 参数（1-4）
  //   - choice='skip'  允许跳过（放弃技能）
  // 任意分支结束后清空 pendingVirgoChoice + incrementMoveCounter
  respondVirgoPerfect: {
    move: (
      { G, ctx }: MoveCtx,
      choice: VirgoPerfectChoice | 'skip',
      params?: { targetID?: string; layer?: number },
    ) => {
      if (G.phase !== 'playing') return INVALID_MOVE;
      const pending = G.pendingVirgoChoice;
      if (!pending) return INVALID_MOVE;
      if (ctx.currentPlayer !== pending.virgoID) return INVALID_MOVE;

      if (choice === 'skip') {
        return incrementMoveCounter({ ...G, pendingVirgoChoice: null });
      }

      let next: SetupState | null;
      if (choice === 'revive') {
        const targetID = params?.targetID;
        if (typeof targetID !== 'string') return INVALID_MOVE;
        next = applyVirgoResurrect(G, pending.virgoID, targetID);
      } else if (choice === 'draw_two') {
        next = applyVirgoDrawTwo(G, pending.virgoID);
      } else if (choice === 'teleport') {
        const layer = params?.layer;
        if (typeof layer !== 'number') return INVALID_MOVE;
        next = applyVirgoTeleport(G, pending.virgoID, layer);
      } else {
        return INVALID_MOVE;
      }

      if (next === null) return INVALID_MOVE;
      return incrementMoveCounter({ ...next, pendingVirgoChoice: null });
    },
    client: false,
  },

  // 白羊·星尘（skill_0）· 发动分支：翻开受害者所在层梦魇并执行效果
  // 对照：docs/manual/05-dream-thieves.md 白羊 62-71 行
  // 约束：只能由 pendingAriesChoice.ariesID 本人发起；梦魇效果后清除 nightmareId 并记入 usedNightmareIds
  playAriesStardustActivate: {
    move: ({ G, ctx, random }: MoveCtx, params?: Record<string, unknown>) => {
      if (G.phase !== 'playing') return INVALID_MOVE;
      const pending = G.pendingAriesChoice;
      if (!pending) return INVALID_MOVE;
      if (ctx.currentPlayer !== pending.ariesID) return INVALID_MOVE;
      const ls = G.layers[pending.victimLayer];
      if (!ls || !ls.nightmareId || ls.nightmareRevealed) return INVALID_MOVE;
      const nid = ls.nightmareId;
      // 先翻开 + 清 pending
      const s = applyAriesStardustReveal(G);
      if (s === null) return INVALID_MOVE;
      // 执行梦魇效果
      const afterEffect = applyNightmareEffect(s, pending.victimLayer, nid, random, params);
      if (afterEffect === INVALID_MOVE) return INVALID_MOVE;
      // 清除梦魇并记入已发动
      return {
        ...afterEffect,
        layers: {
          ...afterEffect.layers,
          [pending.victimLayer]: {
            ...afterEffect.layers[pending.victimLayer]!,
            nightmareId: null,
            nightmareRevealed: false,
            nightmareTriggered: true,
          },
        },
        usedNightmareIds: [...afterEffect.usedNightmareIds, nid],
      };
    },
    client: false,
  },

  // 白羊·星尘（skill_0）· 弃牌分支：弃该层未翻梦魇（联动闪耀抽牌计数）
  playAriesStardustDiscard: {
    move: ({ G, ctx }: MoveCtx) => {
      if (G.phase !== 'playing') return INVALID_MOVE;
      const pending = G.pendingAriesChoice;
      if (!pending) return INVALID_MOVE;
      if (ctx.currentPlayer !== pending.ariesID) return INVALID_MOVE;
      const next = applyAriesStardustDiscard(G);
      if (next === null) return INVALID_MOVE;
      return next;
    },
    client: false,
  },
};
