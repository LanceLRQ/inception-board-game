// 盗梦者的击杀与 SHOOT 类主动技能：意念判官、格林射线、哈雷、露娜·月蚀、雅典娜·惊叹。

import type { CardID, Layer } from '@icgame/shared';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import {
  HALEY_SKILL_ID,
  SUDGER_SKILL_ID,
  applyAthenaAwe,
  applyLunaEclipse,
  isShootClassCard,
  markSkillUsed,
} from '../engine/skills.js';
import {
  discardCard,
  incrementMoveCounter,
  movePlayerToLayer,
  recordCardPlayed,
} from '../stateOps.js';
import { type MoveCtx, guardTurnPhase } from './common.js';
import { getShootProfile } from './shootProfiles.js';
import { applyShootByCard, applyShootVariant, settleSudgerPick } from './shootResolution.js';

export const thiefAttackSkillMoves = {
  // 意念判官·定罪（两步 move 第 1 步）：与普通 SHOOT 同一套前置校验与应答窗口，
  // 只把掷骰改成「掷 2 颗骰存 pending」；目标是可闪避的双鱼时先开应答窗口，放弃后再掷。
  // 对照：docs/manual/05-dream-thieves.md 意念判官 261 行
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
      if (!isShootClassCard(cardId)) return INVALID_MOVE;
      // 死亡面 / 移动面 / 附带弃牌 / 是否要求同层取自 SHOOT 参数表；
      // 层数限制由共同结算校验：只有刺客之王不要求同层（意念判官不具备摩羯 / 恐怖分子的豁免）
      const r = applyShootByCard(G, ctx, random, targetPlayerID, cardId, {
        decreeId,
        skill: 'sudger_verdict',
      });
      if (r === INVALID_MOVE) return r;
      return recordCardPlayed(markSkillUsed(r, ctx.currentPlayer, SUDGER_SKILL_ID), cardId);
    },
    client: false,
  },

  // 意念判官·定罪（两步 move 第 2 步）：选 A/B → 与普通 SHOOT 同一个结果落地
  resolveSudgerPick: {
    move: ({ G, ctx }: MoveCtx, pick: 'A' | 'B') => {
      if (!G.pendingSudgerRolls) return INVALID_MOVE;
      if (ctx.currentPlayer !== G.currentPlayerID) return INVALID_MOVE;
      return settleSudgerPick(G, ctx.currentPlayer, pick);
    },
    client: false,
  },

  // 格林射线·缉捕：弃 1 张穿梭剂和 1 张 SHOOT 类牌，可以移动到任意一层梦境，然后可以执行该 SHOOT 类牌的效果
  // 移动与射击各自可选：targetLayer 省略（或等于当前所在层）= 不移动，targetPlayerID 省略 = 不射击；
  // 两样都不做则不产生任何效果，不能发动。代价（穿梭剂 + SHOOT 类牌）无论怎么选都照付；
  // 只移动时 SHOOT 牌只是被弃掉的代价，不算打出；射击时按该牌的参数表走共同结算。
  // 对照：docs/manual/04-action-cards.md 梦境穿梭剂 / SHOOT；格林射线角色牌「缉捕」
  playGreenRayArrest: {
    move: (
      { G, ctx, random }: MoveCtx,
      shootCardId: CardID,
      targetPlayerID?: string | null,
      targetLayer?: number | null,
    ) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.isAlive) return INVALID_MOVE;
      if (self.characterId !== 'thief_green_ray') return INVALID_MOVE;
      const transitCard = 'action_dream_transit' as CardID;
      if (!self.hand.includes(transitCard)) return INVALID_MOVE;
      if (!self.hand.includes(shootCardId)) return INVALID_MOVE;
      if (!isShootClassCard(shootCardId)) return INVALID_MOVE;

      const wantsShoot = targetPlayerID !== undefined && targetPlayerID !== null;
      if (wantsShoot) {
        // target 基本校验（完整校验由 applyShootVariant 处理）
        const target = G.players[targetPlayerID];
        if (!target || !target.isAlive || targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
      }
      const hasLayer = targetLayer !== undefined && targetLayer !== null;
      if (hasLayer && (!Number.isInteger(targetLayer) || targetLayer < 1 || targetLayer > 4)) {
        return INVALID_MOVE;
      }
      const wantsMove = hasLayer && targetLayer !== self.currentLayer;
      // 不移动也不射击：技能不产生任何效果，不能无故启动
      if (!wantsMove && !wantsShoot) return INVALID_MOVE;

      // 1) 弃穿梭剂（SHOOT 牌：射击时留给共同结算弃，只移动时作为代价直接弃）
      let s = discardCard(G, ctx.currentPlayer, transitCard);
      // 2) 移到目标层
      if (wantsMove) s = movePlayerToLayer(s, ctx.currentPlayer, targetLayer as Layer);
      // 3) 只移动：弃掉 SHOOT 牌作为代价，不射击
      if (!wantsShoot) return incrementMoveCounter(discardCard(s, ctx.currentPlayer, shootCardId));
      // 4) 射击：按牌取 SHOOT 参数表 → 复用 SHOOT 结算
      const r = applyShootByCard(s, ctx, random, targetPlayerID, shootCardId);
      return r === INVALID_MOVE ? r : recordCardPlayed(r, shootCardId);
    },
    client: false,
  },

  // 哈雷·冲击：成功解封后 unlocker 可视为对另一位玩家使用 1 张 SHOOT，掷骰结果 -2
  // 对照：docs/manual/05-dream-thieves.md 哈雷 145 行
  // 没有实体牌：不弃牌、不走水星·逆流、不计入出牌记录、不受层数限制、不带死亡宣言；
  // 骰面按普通 SHOOT，其余（双鱼应答窗口、选层、白羊·星尘、处女·完美）走共同结算。
  // 设计：可选触发，独立 move；同回合多次解封可多次触发
  playHaleyImpact: {
    move: ({ G, ctx, random }: MoveCtx, targetID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.isAlive) return INVALID_MOVE;
      if (self.characterId !== 'thief_haley') return INVALID_MOVE;
      // 必须本回合刚成功解封过（successfulUnlocksThisTurn > 已用 haley 次数）
      const used = self.skillUsedThisTurn[HALEY_SKILL_ID] ?? 0;
      if (self.successfulUnlocksThisTurn <= used) return INVALID_MOVE;

      const profile = getShootProfile('action_shoot');
      if (!profile) return INVALID_MOVE;
      const r = applyShootVariant(G, ctx, random, targetID, null, {
        ...profile,
        sameLayerRequired: false,
        skill: 'haley_impact',
      });
      if (r === INVALID_MOVE) return r;
      return markSkillUsed(r, ctx.currentPlayer, HALEY_SKILL_ID);
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
