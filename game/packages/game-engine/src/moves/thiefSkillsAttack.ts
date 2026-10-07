// 盗梦者的击杀与 SHOOT 类主动技能：意念判官、格林射线、哈雷、露娜·月蚀、雅典娜·惊叹。

import type { CardID, Layer } from '@icgame/shared';
import { resolveShootCustom } from '../dice.js';
import { killPlayer } from '../engine/death.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import {
  HALEY_SKILL_ID,
  SUDGER_SKILL_ID,
  applyAthenaAwe,
  applyHaleyImpact,
  applyLunaEclipse,
  applySudgerVerdict,
  isShootClassCard,
  markSkillUsed,
  settleVirgoPerfect,
} from '../engine/skills.js';
import {
  discardCard,
  discardCards,
  incrementMoveCounter,
  movePlayerToLayer,
  recordCardPlayed,
} from '../stateOps.js';
import { type MoveCtx, guardTurnPhase } from './common.js';
import { getShootProfile } from './shootProfiles.js';
import { applyShootByCard, validateDecree, violatesShootLayerLimit } from './shootResolution.js';

export const thiefAttackSkillMoves = {
  // 意念判官·定罪（两步 move 第 1 步）：掷双骰 → 存 pending
  // 对照：docs/manual/05-dream-thieves.md 意念判官
  playShootSudger: {
    move: (
      { G, ctx, random }: MoveCtx,
      targetPlayerID: string,
      cardId: CardID,
      decreeId?: CardID,
    ) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.isAlive) return INVALID_MOVE;
      if (self.characterId !== 'thief_sudger_of_mind') return INVALID_MOVE;
      if (!self.hand.includes(cardId)) return INVALID_MOVE;
      if (!isShootClassCard(cardId)) return INVALID_MOVE;
      const target = G.players[targetPlayerID];
      if (!target || !target.isAlive || targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
      // 死亡面 / 移动面 / 附带弃牌 / 是否要求同层取自 SHOOT 参数表
      const opts = getShootProfile(cardId);
      if (!opts) return INVALID_MOVE;
      // 与普通路径同一套层数限制：只有刺客之王不要求同层（意念判官不具备摩羯 / 恐怖分子的豁免）
      if (violatesShootLayerLimit(G, self, target, opts.sameLayerRequired)) return INVALID_MOVE;

      // 死亡宣言校验
      const decreeCheck = validateDecree(G, ctx.currentPlayer, decreeId);
      if (decreeCheck === 'INVALID') return INVALID_MOVE;

      const deathFaces = decreeCheck !== null ? [...opts.deathFaces, decreeCheck] : opts.deathFaces;

      const rollA = random.D6();
      const rollB = random.D6();
      const s = markSkillUsed(G, ctx.currentPlayer, SUDGER_SKILL_ID);
      return {
        ...s,
        pendingSudgerRolls: {
          rollA,
          rollB,
          targetPlayerID,
          cardId,
          deathFaces,
          moveFaces: opts.moveFaces,
          extraOnMove: opts.extraOnMove,
        },
      };
    },
    client: false,
  },

  // 意念判官·定罪（两步 move 第 2 步）：选 A/B → SHOOT 结算
  resolveSudgerPick: {
    move: ({ G, ctx }: MoveCtx, pick: 'A' | 'B') => {
      const pending = G.pendingSudgerRolls;
      if (!pending) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.currentPlayerID) return INVALID_MOVE;

      const chosenRoll = applySudgerVerdict(pending.rollA, pending.rollB, pick);
      const result = resolveShootCustom(chosenRoll, pending.deathFaces, pending.moveFaces);

      let s = discardCard(G, ctx.currentPlayer, pending.cardId);

      if (result === 'kill') {
        s = { ...s, pendingSudgerRolls: null };
        s = killPlayer(s, pending.targetPlayerID, ctx.currentPlayer);
      } else if (result === 'move') {
        if (pending.extraOnMove) {
          const tp = s.players[pending.targetPlayerID]!;
          const dropped = tp.hand.filter((id) =>
            pending.extraOnMove === 'discard_unlocks'
              ? id === 'action_unlock'
              : isShootClassCard(id),
          );
          if (dropped.length > 0) {
            s = discardCards(s, pending.targetPlayerID, dropped);
          }
        }
        const target = s.players[pending.targetPlayerID]!;
        const cur = target.currentLayer;
        const dir = cur >= 4 ? -1 : 1;
        const nl = Math.max(1, Math.min(4, cur + dir));
        s = { ...s, pendingSudgerRolls: null };
        s = movePlayerToLayer(s, pending.targetPlayerID, nl);
      } else {
        s = { ...s, pendingSudgerRolls: null };
      }

      s = settleVirgoPerfect(s, chosenRoll);
      return recordCardPlayed(incrementMoveCounter(s), pending.cardId);
    },
    client: false,
  },

  // 格林射线·缉捕：弃穿梭剂 + SHOOT → 移到任意层 → 执行 SHOOT 效果
  // 对照：docs/manual/05-dream-thieves.md 格林射线
  playGreenRayArrest: {
    move: (
      { G, ctx, random }: MoveCtx,
      shootCardId: CardID,
      targetPlayerID: string,
      targetLayer: number,
    ) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.isAlive) return INVALID_MOVE;
      if (self.characterId !== 'thief_green_ray') return INVALID_MOVE;
      const transitCard = 'action_dream_transit' as CardID;
      if (!self.hand.includes(transitCard)) return INVALID_MOVE;
      if (!self.hand.includes(shootCardId)) return INVALID_MOVE;
      if (!isShootClassCard(shootCardId)) return INVALID_MOVE;
      // target 基本校验（完整校验由 applyShootVariant 处理）
      const target = G.players[targetPlayerID];
      if (!target || !target.isAlive || targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
      if (targetLayer < 1 || targetLayer > 4) return INVALID_MOVE;

      // 1) 弃穿梭剂（SHOOT 牌留给 applyShootVariant 弃）
      let s = discardCard(G, ctx.currentPlayer, transitCard);
      // 2) 移到目标层
      s = movePlayerToLayer(s, ctx.currentPlayer, targetLayer as Layer);
      // 3) 按牌取 SHOOT 参数表 → 复用 SHOOT 结算
      const r = applyShootByCard(s, ctx, random, targetPlayerID, shootCardId);
      return r === INVALID_MOVE ? r : recordCardPlayed(r, shootCardId);
    },
    client: false,
  },

  // 哈雷·冲击：成功解封后 unlocker 可对另一位玩家发动 -2 修饰 SHOOT
  // 对照：docs/manual/05-dream-thieves.md 哈雷
  // 设计：可选触发，独立 move；同回合多次解封可多次触发
  playHaleyImpact: {
    move: ({ G, ctx, random }: MoveCtx, targetID: string) => {
      const self = G.players[ctx.currentPlayer];
      if (!self || self.characterId !== 'thief_haley') return INVALID_MOVE;
      if (!self.isAlive) return INVALID_MOVE;
      if (G.turnPhase !== 'action') return INVALID_MOVE;
      const target = G.players[targetID];
      if (!target || !target.isAlive) return INVALID_MOVE;
      if (targetID === ctx.currentPlayer) return INVALID_MOVE;
      // 必须本回合刚成功解封过（successfulUnlocksThisTurn > 已用 haley 次数）
      const used = self.skillUsedThisTurn[HALEY_SKILL_ID] ?? 0;
      if (self.successfulUnlocksThisTurn <= used) return INVALID_MOVE;

      let s = markSkillUsed(G, ctx.currentPlayer, HALEY_SKILL_ID);
      // 用 applyShootVariant 复用 SHOOT 结算（虚拟 cardId='haley_skill_proxy'）
      // 但 applyShootVariant 校验 cardId 必须在手中，这里需要绕过。
      // 简化：直接结算骰值 + 应用效果（不通过 applyShootVariant）
      const rawRoll = random.D6();
      s = { ...s, lastShootRoll: rawRoll };
      const finalRoll = applyHaleyImpact(rawRoll);
      const shootResult =
        finalRoll === 1 ? 'kill' : finalRoll >= 2 && finalRoll <= 5 ? 'move' : 'miss';
      if (shootResult === 'kill') {
        s = killPlayer(s, targetID, ctx.currentPlayer);
      } else if (shootResult === 'move') {
        const cur = target.currentLayer;
        const dir = cur >= 4 ? -1 : 1;
        const nl = Math.max(1, Math.min(4, cur + dir));
        s = movePlayerToLayer(s, targetID, nl);
      }
      return incrementMoveCounter(s);
    },
    client: false,
  },

  // 露娜·月蚀：弃 2 张 SHOOT → 击杀同层任意玩家 → 翻面
  // 对照：docs/manual/05-dream-thieves.md 露娜
  playLunaEclipse: {
    move: ({ G, ctx }: MoveCtx, shootCardIds: CardID[], targetID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!Array.isArray(shootCardIds)) return INVALID_MOVE;
      const next = applyLunaEclipse(G, ctx.currentPlayer, shootCardIds, targetID);
      if (next === null) return INVALID_MOVE;
      return incrementMoveCounter(next);
    },
    client: false,
  },

  // 雅典娜·惊叹：展示 4 手牌 + 1 牌库顶；5 张同名 → 击杀同层 1 玩家
  // 对照：docs/manual/05-dream-thieves.md 雅典娜
  playAthenaAwe: {
    move: ({ G, ctx }: MoveCtx, shownHandIds: CardID[], targetID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!Array.isArray(shownHandIds)) return INVALID_MOVE;
      const next = applyAthenaAwe(G, ctx.currentPlayer, shownHandIds, targetID);
      if (next === null) return INVALID_MOVE;
      return next;
    },
    client: false,
  },
};
