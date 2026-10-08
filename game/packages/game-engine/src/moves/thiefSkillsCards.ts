// 盗梦者处理手牌与牌库的主动技能：替代抽牌、换牌、取弃牌堆、窥探与整理牌库。

import type { CardID } from '@icgame/shared';
import { isRecordOf, isStringArray } from '../engine/argShape.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import {
  LIBRA_SKILL_ID,
  applyApolloWorship,
  applyAquariusCoherence,
  applyBlackSwanTour,
  applyChemistRefine,
  applyForgerExchange,
  applyGeminiChoice,
  applyLordOfWarBlackMarket,
  applySpaceQueenStashTop,
  canUseSkill,
  endDrawPhase,
  jokerDrawCount,
  libraResolvePick,
  libraValidateSplit,
  markSkillUsed,
  startBlackHoleLevy,
  startDarwinEvolution,
} from '../engine/skills.js';
import { drawCards, incrementMoveCounter } from '../stateOps.js';
import { type MoveCtx, guardTurnPhase } from './common.js';

export const thiefCardSkillMoves = {
  // 小丑·赌博（略过抽牌阶段 → 掷骰 → 抽 D6 张）
  // 对照：docs/manual/05-dream-thieves.md 小丑
  playJokerGamble: {
    move: ({ G, ctx, random }: MoveCtx) => {
      if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
      const player = G.players[G.currentPlayerID];
      if (!player || !player.isAlive) return INVALID_MOVE;
      if (player.characterId !== 'thief_joker') return INVALID_MOVE;
      const roll = random.D6();
      const count = jokerDrawCount(roll);
      let s = drawCards(G, G.currentPlayerID, count);
      // 罚则：发动当回合的弃牌阶段强制全弃（巨蟹·庇佑不豁免）
      // 记录当前 turnNumber，discard 检查时与回合号相等才生效，回合结束后自然失效
      s = {
        ...s,
        players: {
          ...s.players,
          [G.currentPlayerID]: {
            ...s.players[G.currentPlayerID]!,
            forcedDiscardArmedAtTurn: G.turnNumber,
          },
        },
      };
      return endDrawPhase(s);
    },
    client: false,
  },

  // 黑天鹅·巡演（略过抽牌阶段 → 分发所有手牌 → 抽 4）
  // 对照：docs/manual/05-dream-thieves.md 黑天鹅
  playBlackSwanTour: {
    move: ({ G, ctx }: MoveCtx, distribution: Record<string, CardID[]>) => {
      if (!isRecordOf(distribution, isStringArray)) return INVALID_MOVE;
      if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
      const applied = applyBlackSwanTour(G, G.currentPlayerID, distribution);
      if (applied === null) return INVALID_MOVE;
      return endDrawPhase(applied);
    },
    client: false,
  },

  // 黑洞·吞噬（抽牌阶段替代 doDraw，两步）：
  //   第 1 步 playBlackHoleLevy：发动，放弃抽牌，挂起；同层有手牌的每个其他玩家各自选 1 张交出
  //   第 2 步 respondBlackHoleLevy：名单里的人交出自己选的牌（见 moves/responses.ts），交齐后抽牌阶段结束
  // 发动者不指明别人的牌：别人的手牌客户端看不到，发动者指牌会泄露手牌信息，也由交牌人自己决定交哪张。
  // 对照：docs/manual/05-dream-thieves.md:150-158 黑洞
  playBlackHoleLevy: {
    move: ({ G, ctx }: MoveCtx) => {
      if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
      const started = startBlackHoleLevy(G, G.currentPlayerID);
      if (started === null) return INVALID_MOVE;
      return incrementMoveCounter(started);
    },
    client: false,
  },

  // 双子·抉择（skill_1）：梦主在更小层时，掷 2 骰抽 (r1+r2) 张 → 翻面
  // 对照：docs/manual/05-dream-thieves.md 双子 83-89 行
  playGeminiChoice: {
    move: ({ G, ctx, random }: MoveCtx) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const roll1 = random.D6();
      const roll2 = random.D6();
      const next = applyGeminiChoice(G, ctx.currentPlayer, roll1, roll2);
      if (next === null) return INVALID_MOVE;
      return next;
    },
    client: false,
  },

  // 达尔文·淘汰（两步，限 1 次/回合）：
  //   第 1 步 playDarwinEvolution：发动，先抽牌库顶 2 张收入手牌，挂起
  //   第 2 步 respondDarwinReturn：从抽牌后的手牌里选刚好 2 张按顺序放回牌库顶（见 moves/responses.ts）
  // 对照：卡面「淘汰」（扩展角色，说明书没有收录）
  playDarwinEvolution: {
    move: ({ G, ctx }: MoveCtx) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const started = startDarwinEvolution(G, ctx.currentPlayer);
      if (started === null) return INVALID_MOVE;
      return incrementMoveCounter(started);
    },
    client: false,
  },

  // 欺诈师·盗心（单机盲抽版）—— 固定抽 1 张，用 BGIO Random 在服务端
  // 随机挑选，避免客户端能看到 target 手牌即违反隐藏信息原则。
  // 对照：docs/manual/05-dream-thieves.md 欺诈师 · applyForgerExchange
  playForgerExchangeSingle: {
    move: ({ G, ctx, random }: MoveCtx, targetID: string, returnedCardId: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const target = G.players[targetID];
      if (!target || !target.isAlive) return INVALID_MOVE;
      if (target.hand.length === 0) return INVALID_MOVE;
      // 用 Random.Die 在服务端挑 1 张（隐藏信息保护）
      const pickIdx = random.Die(target.hand.length) - 1;
      const taken = target.hand[pickIdx]!;
      const next = applyForgerExchange(G, ctx.currentPlayer, {
        targetID,
        takenFromTarget: [taken],
        returnedToTarget: [returnedCardId],
      });
      if (next === null) return INVALID_MOVE;
      return incrementMoveCounter(next);
    },
    client: false,
  },

  // 天秤·平衡 step 1：bonder 把所有手牌交给 target，进入 pendingLibra
  // 对照：docs/manual/05-dream-thieves.md 天秤
  playLibraBalance: {
    move: ({ G, ctx }: MoveCtx, targetID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const self = G.players[ctx.currentPlayer];
      const target = G.players[targetID];
      if (!self || !target) return INVALID_MOVE;
      if (self.characterId !== 'thief_libra') return INVALID_MOVE;
      if (!self.isAlive || !target.isAlive) return INVALID_MOVE;
      if (targetID === ctx.currentPlayer) return INVALID_MOVE;
      if (self.hand.length === 0) return INVALID_MOVE;
      if (!canUseSkill(self, LIBRA_SKILL_ID, 'ownTurnOncePerTurn')) return INVALID_MOVE;

      // 把 bonder 全部手牌转给 target；保留备份在 pendingLibra
      let s = markSkillUsed(G, ctx.currentPlayer, LIBRA_SKILL_ID);
      const transferredHand = [...self.hand];
      s = {
        ...s,
        players: {
          ...s.players,
          [ctx.currentPlayer]: { ...s.players[ctx.currentPlayer]!, hand: [] },
          [targetID]: {
            ...s.players[targetID]!,
            hand: [...s.players[targetID]!.hand, ...transferredHand],
          },
        },
        pendingLibra: {
          bonderPlayerID: ctx.currentPlayer,
          targetPlayerID: targetID,
          split: null,
        },
      };
      return incrementMoveCounter(s);
    },
    client: false,
  },

  // 天秤·平衡 step 2：target 提交分组
  // 发起者由行动权表限定为被要求分牌的 target，这里不再核对 ctx.currentPlayer。
  // split 合法性由 libraValidateSplit 守护。
  resolveLibraSplit: {
    move: ({ G }: MoveCtx, pile1: CardID[], pile2: CardID[]) => {
      if (!isStringArray(pile1) || !isStringArray(pile2)) return INVALID_MOVE;
      const pl = G.pendingLibra;
      if (!pl) return INVALID_MOVE;
      if (pl.split !== null) return INVALID_MOVE;
      const target = G.players[pl.targetPlayerID];
      if (!target) return INVALID_MOVE;
      if (!libraValidateSplit(target.hand, pile1, pile2)) return INVALID_MOVE;
      return {
        ...G,
        pendingLibra: {
          ...pl,
          split: { pile1: [...pile1], pile2: [...pile2] },
        },
      };
    },
    client: false,
  },

  // 天秤·平衡 step 3：bonder 选哪份；执行后清空 pendingLibra
  // 天秤·平衡 step 3：bonder 选哪堆
  // 发起者由行动权表限定为发动者 bonder，这里不再核对 ctx.currentPlayer（理由同 step 2）。
  resolveLibraPick: {
    move: ({ G }: MoveCtx, pick: 'pile1' | 'pile2') => {
      const pl = G.pendingLibra;
      if (!pl || !pl.split) return INVALID_MOVE;
      if (pick !== 'pile1' && pick !== 'pile2') return INVALID_MOVE;

      const r = libraResolvePick(pl.split, pick);
      const bonder = G.players[pl.bonderPlayerID]!;
      const target = G.players[pl.targetPlayerID]!;
      return {
        ...G,
        players: {
          ...G.players,
          [pl.bonderPlayerID]: {
            ...bonder,
            hand: [...bonder.hand, ...r.selfGets],
          },
          [pl.targetPlayerID]: {
            ...target,
            hand: r.targetGets,
          },
        },
        pendingLibra: null,
      };
    },
    client: false,
  },

  // 阿波罗·崇拜：随机抽取受贿盗梦者 1 张手牌
  // 对照：docs/manual/05-dream-thieves.md 阿波罗
  playApolloWorship: {
    move: ({ G, ctx, random }: MoveCtx, targetID: string) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      // 用 D6 注入随机性（保证 BGIO 确定性）
      const pickIdx = random.D6() - 1;
      const next = applyApolloWorship(G, ctx.currentPlayer, targetID, pickIdx);
      if (next === null) return INVALID_MOVE;
      return next;
    },
    client: false,
  },

  // 药剂师·调剂：弃 1 手牌 → 弃牌堆梦境穿梭剂入手
  // 对照：docs/manual/05-dream-thieves.md 药剂师
  playChemistRefine: {
    move: ({ G, ctx }: MoveCtx, discardCardId: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const next = applyChemistRefine(G, ctx.currentPlayer, discardCardId);
      if (next === null) return INVALID_MOVE;
      return next;
    },
    client: false,
  },

  // 水瓶·凝聚（skill_0）：每用过 2 张同名牌可从弃牌堆取 1 张本回合未用过的牌入手
  // 对照：docs/manual/05-dream-thieves.md 水瓶 46-50 行
  playAquariusCoherence: {
    move: ({ G, ctx }: MoveCtx, pickCardId: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      const next = applyAquariusCoherence(G, ctx.currentPlayer, pickCardId);
      if (next === null) return INVALID_MOVE;
      return next;
    },
    client: false,
  },

  // 战争之王·黑市：弃 2 手牌 → 弃牌堆任 1 张入手
  // 对照：docs/manual/05-dream-thieves.md 战争之王
  playLordOfWarBlackMarket: {
    move: ({ G, ctx }: MoveCtx, discardIds: CardID[], pickFromDiscard: CardID) => {
      if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
      if (!Array.isArray(discardIds)) return INVALID_MOVE;
      const next = applyLordOfWarBlackMarket(G, ctx.currentPlayer, discardIds, pickFromDiscard);
      if (next === null) return INVALID_MOVE;
      return next;
    },
    client: false,
  },

  // 空间女王·造物：任意玩家的弃牌阶段，可以把 1 张手牌放到牌库顶
  // 对照：docs/manual/05-dream-thieves.md 空间女王
  // 卡面没有写次数限制，所以不限次数；弃牌阶段可以是别人的，因此是回合外可发的 move
  // （行动权表 engine/actionRights.ts 的 OFF_TURN_MOVES），发起者是空间女王本人，不要求是回合主人。
  useSpaceQueenStashTop: {
    move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
      if (G.phase !== 'playing') return INVALID_MOVE;
      if (G.turnPhase !== 'discard') return INVALID_MOVE;
      const result = applySpaceQueenStashTop(G, ctx.currentPlayer, cardId);
      if (result === null) return INVALID_MOVE;
      return result;
    },
    client: false,
  },
};
