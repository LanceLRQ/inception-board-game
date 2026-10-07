// 盗梦者改变盘面的主动技能：移动与换层、复活、心锁增减、迷宫。

import type { CardID, Layer } from '@icgame/shared';
import { PLAYER_COUNT_CONFIGS } from '../config.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import {
  SAGITTARIUS_HEART_LOCK_SKILL_ID,
  applyBlackHoleAbsorb,
  applyChemistInject,
  applyGaiaShift,
  applyGeminiSync,
  applyLunaFullMoon,
  applyMartyrSacrifice,
  applyPaprikSalvation,
  applyPiscesBlessing,
  applySagittariusHeartLock,
  applyShadeFollow,
  applyTouristAssist,
  canUseSagittariusHeartLock,
  isShootClassCard,
  markSkillUsed,
} from '../engine/skills.js';
import { discardCard, incrementMoveCounter, setTurnPhase } from '../stateOps.js';
import { type MoveCtx, guardTurnPhase } from './common.js';
import { settleVaultOpened } from './settlement.js';

export const thiefBoardSkillMoves = {
  // 黑洞·吸纳（行动阶段：指定相邻层所有玩家移到黑洞所在层）
  // 对照：docs/manual/05-dream-thieves.md 黑洞
  useBlackHoleAbsorb: {
    move: ({ G, ctx }: MoveCtx, targetLayer: number) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const applied = applyBlackHoleAbsorb(G, ctx.currentPlayer, targetLayer);
      if (applied === null) return INVALID_MOVE;
      return applied;
    },
    client: false,
  },

  // 射手·穿心：本回合击杀过玩家时，修改任意一层心锁 ±1（回合限 1 次）
  // 对照：docs/manual/05-dream-thieves.md 射手
  useSagittariusHeartLock: {
    move: ({ G, ctx, random }: MoveCtx, layer: number, delta: -1 | 1) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      if (!self || !self.isAlive) return INVALID_MOVE;
      if (self.characterId !== 'thief_sagittarius') return INVALID_MOVE;
      if (!canUseSagittariusHeartLock(G, ctx.currentPlayer)) return INVALID_MOVE;
      if (!G.layers[layer]) return INVALID_MOVE;
      // cap = 该层初始心锁数（对照 config）
      const heartLocksTuple = PLAYER_COUNT_CONFIGS[G.playerOrder.length]?.heartLocks;
      const cap = heartLocksTuple?.[layer - 1] ?? 3;
      const result = applySagittariusHeartLock(G, ctx.currentPlayer, layer, delta, cap);
      if (result === null) return INVALID_MOVE;
      const settled = settleVaultOpened(G, result, random);
      return markSkillUsed(settled, ctx.currentPlayer, SAGITTARIUS_HEART_LOCK_SKILL_ID);
    },
    client: false,
  },

  // 双子·协同：弃牌阶段，梦主在更大层时掷骰 → 3 → 当层 -2 心锁 → 翻面
  // 对照：docs/manual/05-dream-thieves.md 双子
  playGeminiSync: {
    move: ({ G, ctx, random }: MoveCtx) => {
      if (ctx.currentPlayer !== G.currentPlayerID) return INVALID_MOVE;
      if (G.turnPhase !== 'discard') return INVALID_MOVE;
      const roll = random.D6();
      const next = applyGeminiSync(G, ctx.currentPlayer, roll);
      if (next === null) return INVALID_MOVE;
      return settleVaultOpened(G, next, random);
    },
    client: false,
  },

  // 盖亚·大地：令同层其余玩家移到 ±1 层（限 2 次/回合）
  // 对照：docs/manual/05-dream-thieves.md 盖亚
  playGaiaShift: {
    move: ({ G, ctx }: MoveCtx, picks: Record<string, -1 | 1>) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!picks || typeof picks !== 'object') return INVALID_MOVE;
      const next = applyGaiaShift(G, ctx.currentPlayer, picks);
      if (next === null) return INVALID_MOVE;
      return incrementMoveCounter(next);
    },
    client: false,
  },

  // 影子·潜伏：移到梦主所在层
  // 对照：docs/manual/05-dream-thieves.md 影子
  playShadeFollow: {
    move: ({ G, ctx }: MoveCtx) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const next = applyShadeFollow(G, ctx.currentPlayer);
      if (next === null) return INVALID_MOVE;
      return incrementMoveCounter(next);
    },
    client: false,
  },

  // 双鱼·洗礼（skill_1）：+1 相邻层 + 可选复活 1 人到新层 → 翻面
  // 对照：docs/manual/05-dream-thieves.md 双鱼 55-60 行
  playPiscesBlessing: {
    move: ({ G, ctx }: MoveCtx, reviveID: string | null) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const next = applyPiscesBlessing(G, ctx.currentPlayer, reviveID ?? null);
      if (next === null) return INVALID_MOVE;
      return incrementMoveCounter(next);
    },
    client: false,
  },

  // 露娜·满月（skill_1）：弃 2 张非 SHOOT → 复活任意数量玩家至当前层 → 翻面
  // 对照：docs/manual/05-dream-thieves.md 露娜 21-25 行
  playLunaFullMoon: {
    move: ({ G, ctx }: MoveCtx, discardCardIds: CardID[], reviveIDs: string[]) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!Array.isArray(discardCardIds) || !Array.isArray(reviveIDs)) return INVALID_MOVE;
      const next = applyLunaFullMoon(G, ctx.currentPlayer, discardCardIds, reviveIDs);
      if (next === null) return INVALID_MOVE;
      return incrementMoveCounter(next);
    },
    client: false,
  },

  // 穿行者·支助：将所有手牌（≥1）给目标，自己移到目标层
  // 对照：docs/manual/05-dream-thieves.md 穿行者
  playTouristAssist: {
    move: ({ G, ctx }: MoveCtx, targetPlayerID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const next = applyTouristAssist(G, ctx.currentPlayer, targetPlayerID);
      if (next === null) return INVALID_MOVE;
      return next;
    },
    client: false,
  },

  // 药剂师·注射（skill_1）：对同层玩家代打 1 张梦境穿梭剂
  // 对照：docs/manual/05-dream-thieves.md 药剂师 278 行
  playChemistInject: {
    move: ({ G, ctx }: MoveCtx, targetID: string, toLayer: number) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const next = applyChemistInject(G, ctx.currentPlayer, targetID, toLayer as Layer);
      if (next === null) return INVALID_MOVE;
      return incrementMoveCounter(next);
    },
    client: false,
  },

  // 筑梦师·迷宫：弃 1 SHOOT 类牌，标记同层目标"被困"
  // 对照：docs/manual/05-dream-thieves.md 筑梦师
  playArchitectMaze: {
    move: ({ G, ctx }: MoveCtx, discardCardId: CardID, targetID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      const target = G.players[targetID];
      if (!self || !target) return INVALID_MOVE;
      if (self.characterId !== 'thief_architect') return INVALID_MOVE;
      if (!self.isAlive || !target.isAlive) return INVALID_MOVE;
      if (targetID === ctx.currentPlayer) return INVALID_MOVE;
      if (self.currentLayer !== target.currentLayer) return INVALID_MOVE;
      if (!isShootClassCard(discardCardId)) return INVALID_MOVE;
      if (!self.hand.includes(discardCardId)) return INVALID_MOVE;
      // 卡面没有「限一次」，不限次数；代价是每次弃 1 张 SHOOT 类牌
      let s = discardCard(G, ctx.currentPlayer, discardCardId);
      // untilTurnNumber 取 target 的"下个回合 turnNumber"。简化：当前 turnNumber + N（N=玩家数）
      // 真实场景：迷宫维持到 target 下个回合 turnEnd；MVP 用 (G.turnNumber + playerOrder.length) 估算
      s = {
        ...s,
        mazeState: {
          mazedPlayerID: targetID,
          untilTurnNumber: G.turnNumber + G.playerOrder.length,
        },
      };
      return incrementMoveCounter(s);
    },
    client: false,
  },

  // 灵魂牧师·拯救：弃 1 手牌 → 复活迷失层玩家到自己层 + 取其手牌
  // 对照：docs/manual/05-dream-thieves.md 灵魂牧师
  playPaprikSalvation: {
    move: ({ G, ctx }: MoveCtx, discardCardId: CardID, targetID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const next = applyPaprikSalvation(G, ctx.currentPlayer, discardCardId, targetID);
      if (next === null) return INVALID_MOVE;
      return next;
    },
    client: false,
  },

  // 殉道者·牺牲：略过出牌阶段，掷骰 → 改变心锁 ±2 + 自杀
  // 对照：docs/manual/05-dream-thieves.md 殉道者
  playMartyrSacrifice: {
    move: ({ G, ctx, random }: MoveCtx, direction: 'increase' | 'decrease') => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const player = G.players[ctx.currentPlayer];
      if (!player) return INVALID_MOVE;
      // 取本人当前层"原始"心锁数为 cap：使用 PLAYER_COUNT_CONFIGS 的初始值
      const layerNum = player.currentLayer;
      // heartLocks 是长度 4 的元组，layer 1-4 对应索引 0-3
      const heartLocksTuple = PLAYER_COUNT_CONFIGS[G.playerOrder.length]?.heartLocks;
      const cap =
        heartLocksTuple && layerNum >= 1 && layerNum <= 4
          ? ((heartLocksTuple as readonly number[])[layerNum - 1] ?? 5)
          : 5;
      const roll = random.D6();
      const r = applyMartyrSacrifice(G, ctx.currentPlayer, roll, direction, cap);
      if (r === null) return INVALID_MOVE;
      return setTurnPhase(settleVaultOpened(G, r.state, random), 'discard');
    },
    client: false,
  },
};
