// BGIO Game 对象 - 盗梦都市主游戏定义
// 对照：plans/design/02-game-rules-spec.md §2.1 + §7.5.1
//
// BGIO 0.50 回调签名约定：
//   setup: (context: { ctx }, setupData?) => G
//   move:  (context: { G, ctx, playerID, random, events, ... }, ...args) => G | INVALID_MOVE
//   hook:  (context: { G, ctx, events, ... }) => G | void
//   endIf: (context: { G, ctx, ... }) => any | undefined
//
// 回合管理策略（避免 BGIO ctx.currentPlayer 与 G.currentPlayerID 双语义错位）：
//   1. playing 阶段用自定义 turn.order：first 从 G.dreamMasterID 起算，next 顺时针 +1
//   2. playing.turn.onBegin 内调 beginTurn(G, ctx.currentPlayer) 让 G 与 ctx 同步
//   3. 所有 move 扁平化到 playing.moves（不用 BGIO stages），内部自检 G.turnPhase
//   4. 弃牌阶段完成后，move 内调 events.endTurn() 让 BGIO 推进回合

import { INVALID_MOVE } from 'boardgame.io/core';
import { createInitialState, type SetupState, type BribeSetup } from './setup.js';
import { PLAYER_COUNT_CONFIGS } from './config.js';
import {
  drawCards,
  discardCard,
  discardToLimit,
  beginTurn,
  setTurnPhase,
  movePlayerToLayer,
  incrementMoveCounter,
  applyUnlockSuccess,
  applyUnlockCancel,
} from './moves.js';
import { resolveShootCustom } from './dice.js';
import {
  applyPointmanAssault,
  applyInterpreterForeshadow,
  applyChessTranspose,
  applyTouristAssist,
  applyLeoKingdom,
  isCapricornusRhythmActive,
  applyChemistRefine,
  applyLordOfWarBlackMarket,
  applyPaprikSalvation,
  applyScorpiusPoison,
  applyTaurusHorn,
  canUseSkill,
  markSkillUsed,
  SCORPIUS_SKILL_ID,
  applyApolloWorship,
  applyMartyrSacrifice,
  applySoulSculptorCarve,
  applyHaleyImpact,
  applyAthenaAwe,
  HALEY_SKILL_ID,
  libraValidateSplit,
  libraResolvePick,
  isShootClassCard,
  LIBRA_SKILL_ID,
  ARCHITECT_SKILL_ID,
  applyShadeFollow,
  applyHlninoFlow,
  applyExtractorBounty,
  applyForgerExchange,
  isTerroristCrossLayerActive,
  type ForgerExchange,
  applyGeminiSync,
  applyLunaEclipse,
  applyGaiaShift,
  applyDarwinEvolution,
  isAquariusUnlimitedActive,
  getEffectiveMaxUnlockPerTurn,
  checkHarborWin,
  checkNeptuneWin,
  isJupiterPeakWorldActive,
  isJupiterPeakLayerOK,
  shouldJupiterThunderKill,
  canImperialPickBribe,
  applySecretPassageTeleport,
  applyUranusPower,
  applyPlutoBurning,
  canMarsKill,
  applyMarsKillDiscardUnlock,
  isPlutoHellWorldActive,
  applyPlutoHellLostCheck,
  applySaturnFreeMove,
  applyUranusFirmamentMoveDiscard,
  applyMarsBattlefieldExchange,
  applyDiscardHiddenNightmare,
} from './engine/skills.js';
import { shiftGuardAndRestore } from './engine/abilities/shift-guard.js';
import { dispatchPassives } from './engine/abilities/dispatch-helpers.js';
import type { CardID, Faction, Layer } from '@icgame/shared';

export type { SetupState } from './setup.js';

type BGIOCtx = {
  numPlayers: number;
  currentPlayer: string;
  playOrder: string[];
  playOrderPos: number;
};

type BGIOEvents = {
  endTurn: (arg?: { next?: string }) => void;
  endPhase: () => void;
};

type BGIORandom = {
  Die: (n: number) => number;
  D6: () => number;
  Shuffle: <T>(arr: T[]) => T[];
};

type MoveCtx = {
  G: SetupState;
  ctx: BGIOCtx;
  playerID: string;
  random: BGIORandom;
  events: BGIOEvents;
};

// --- 合法性守卫 ---
function guardTurnPhase(G: SetupState, ctx: BGIOCtx, expected: SetupState['turnPhase']): boolean {
  if (G.turnPhase !== expected) return false;
  if (ctx.currentPlayer !== G.currentPlayerID) return false;
  return true;
}

// --- BGIO Game 定义 ---
export const InceptionCityGame = {
  name: 'inception-city',
  minPlayers: 4,
  maxPlayers: 10,
  disableUndo: true,

  setup: ({ ctx }: { ctx: { numPlayers: number } }, setupData?: Record<string, unknown>) => {
    const data = setupData ?? {};
    const numPlayers = ctx.numPlayers;
    const playerIds = Array.from({ length: numPlayers }, (_, i) => String(i));
    const nicknames = playerIds.map((_, i) => `Player ${i + 1}`);

    return createInitialState({
      playerCount: numPlayers,
      playerIds,
      nicknames,
      rngSeed: (data.rngSeed as string | undefined) ?? 'default',
      ruleVariant: data.ruleVariant as string | undefined,
      exCardsEnabled: data.exCardsEnabled as boolean | undefined,
      expansionEnabled: data.expansionEnabled as boolean | undefined,
    });
  },

  phases: {
    setup: {
      start: true,
      moves: {
        pickCharacter: {
          move: ({ G }: { G: SetupState }) => G,
          client: false,
        },
        // 完成 setup：随机决定梦主，切到 playing 阶段
        // 回合归属由 playing.turn.order.first 计算（基于 G.dreamMasterID）
        completeSetup: {
          move: ({ G, random }: MoveCtx) => {
            const masterIdx = random.Die(G.playerOrder.length) - 1;
            const masterID = G.playerOrder[masterIdx]!;

            // 给玩家随机分配角色 —— 涵盖 Phase 3 所有已实装角色
            // 梦主 13 个 · 盗梦者 37 个（对照 plans/tasks.md W11-W16）
            const masterPool: CardID[] = [
              'dm_fortress',
              'dm_chess',
              'dm_harbor',
              'dm_midsummer',
              'dm_black_hole',
              'dm_neptune_ocean',
              'dm_jupiter_peak',
              'dm_saturn_territory',
              'dm_imperial_city',
              'dm_secret_passage',
              'dm_uranus_firmament',
              'dm_pluto_hell',
              'dm_mars_battlefield',
            ];
            const thiefPool: CardID[] = [
              'thief_pointman',
              'thief_dream_interpreter',
              'thief_space_queen',
              'thief_joker',
              'thief_leo',
              'thief_tourist',
              'thief_capricornus',
              'thief_chemist',
              'thief_paprik',
              'thief_lord_of_war',
              'thief_libra',
              'thief_sudger_of_mind',
              'thief_scorpius',
              'thief_taurus',
              'thief_apollo',
              'thief_athena',
              'thief_architect',
              'thief_virgo',
              'thief_haley',
              'thief_martyr',
              'thief_soul_sculptor',
              'thief_shade',
              'thief_hlnino',
              'thief_extractor',
              'thief_forger',
              'thief_terrorist',
              'thief_black_hole',
              'thief_black_swan',
              'thief_gemini',
              'thief_pisces',
              'thief_luna',
              'thief_aries',
              'thief_gaia',
              'thief_sagittarius',
              'thief_aquarius',
              'thief_green_ray',
              'thief_darwin',
            ];
            const masterChar = masterPool[random.Die(masterPool.length) - 1]!;
            const shuffledThieves = random.Shuffle([...thiefPool]);

            const nextPlayers: typeof G.players = { ...G.players };
            let thiefCursor = 0;
            for (const pid of G.playerOrder) {
              if (pid === masterID) {
                nextPlayers[pid] = {
                  ...nextPlayers[pid]!,
                  faction: 'master' as Faction,
                  characterId: masterChar,
                };
              } else {
                const ch = shuffledThieves[thiefCursor % shuffledThieves.length]!;
                thiefCursor++;
                nextPlayers[pid] = {
                  ...nextPlayers[pid]!,
                  characterId: ch,
                };
              }
            }

            return {
              ...G,
              phase: 'playing' as const,
              dreamMasterID: masterID,
              players: nextPlayers,
            };
          },
          client: false,
        },
      },
      next: 'playing',
      endIf: ({ G }: { G: SetupState }) => G.phase === 'playing',
    },

    playing: {
      // 自定义回合顺序：第一回合从梦主起，之后顺时针 +1
      turn: {
        order: {
          first: ({ G }: { G: SetupState; ctx: BGIOCtx }) => {
            const masterID = G.dreamMasterID;
            if (!masterID) return 0;
            const idx = G.playerOrder.indexOf(masterID);
            return idx >= 0 ? idx : 0;
          },
          next: ({ ctx }: { G: SetupState; ctx: BGIOCtx }) =>
            (ctx.playOrderPos + 1) % ctx.numPlayers,
        },
        // 回合开始时同步 G 的 turn 状态
        onBegin: ({ G, ctx }: { G: SetupState; ctx: BGIOCtx }) => {
          let s = beginTurn(G, ctx.currentPlayer);
          // abilities registry：触发 onTurnStart passive
          s = dispatchPassives(s, 'onTurnStart').state;
          return s;
        },
        // 回合末：还原移形换影快照（对照 docs/manual/04-action-cards.md 移形换影 解析）
        // + 检查筑梦师·迷宫是否到期（mazeState.untilTurnNumber 已被超过）
        onEnd: ({ G, ctx }: { G: SetupState; ctx: BGIOCtx }) => {
          let s = shiftGuardAndRestore(G);
          if (s.mazeState && G.turnNumber >= s.mazeState.untilTurnNumber) {
            s = { ...s, mazeState: null };
          }
          // 冥王星地狱世界观：盗梦者回合结束时手牌≥6 → 入迷失层
          // 对照：cards-data.json dm_pluto_hell 世界观
          if (isPlutoHellWorldActive(s)) {
            s = applyPlutoHellLostCheck(s, ctx.currentPlayer);
          }
          // abilities registry：触发 onTurnEnd passive
          s = dispatchPassives(s, 'onTurnEnd').state;
          return s;
        },
      },
      // 所有 move 扁平化（不用 BGIO stages）
      moves: {
        // --- 抽牌阶段 ---
        doDraw: {
          move: ({ G, ctx, random }: MoveCtx) => {
            if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
            // 抽牌前后对比推出 drawnCards（用于先锋技能触发）
            const beforeHand = G.players[G.currentPlayerID]?.hand ?? [];
            // 冥王星地狱世界观：盗梦者抽牌数 = 1 颗骰子结果
            // 对照：cards-data.json dm_pluto_hell 世界观
            const currentPlayer = G.players[G.currentPlayerID];
            const isThief = currentPlayer?.faction === 'thief';
            const plutoOverride = isPlutoHellWorldActive(G) && isThief ? random.D6() : null;
            let s =
              plutoOverride !== null
                ? drawCards(G, G.currentPlayerID, plutoOverride)
                : drawCards(G, G.currentPlayerID);
            const afterHand = s.players[G.currentPlayerID]?.hand ?? [];
            const drawn = afterHand.slice(beforeHand.length);
            // 先锋技能：抽到 action_dream_transit 则额外抽 2 张
            s = applyPointmanAssault(s, G.currentPlayerID, drawn);
            // 狮子王道：抽完后从牌库顶额外抽 = 梦主手牌数
            s = applyLeoKingdom(s, G.currentPlayerID);
            // abilities registry：运行 onDrawPhase passive（白羊·skill_1 等）
            // 主动技能（小丑/黑天鹅）由 UI 通过 listAvailableActives 展示按钮，显式触发
            s = dispatchPassives(s, 'onDrawPhase').state;
            s = setTurnPhase(s, 'action');
            // 进入行动阶段 → 触发 onActionPhase passive
            s = dispatchPassives(s, 'onActionPhase').state;
            return s;
          },
          client: false,
        },
        skipDraw: {
          move: ({ G, ctx }: MoveCtx) => {
            if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
            return setTurnPhase(G, 'action');
          },
          client: false,
        },

        // --- 行动阶段 ---
        endActionPhase: {
          move: ({ G, ctx }: MoveCtx) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            // 嫁接/万有引力未结算不得结束行动阶段
            if (G.pendingGraft) return INVALID_MOVE;
            if (G.pendingGravity) return INVALID_MOVE;
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
            // 进入弃牌阶段 → 触发 onDiscardPhase passive（空间女王·放置 等）
            s = dispatchPassives(s, 'onDiscardPhase').state;
            return s;
          },
          client: false,
        },
        playShoot: {
          move: (
            { G, ctx, random }: MoveCtx,
            targetPlayerID: string,
            cardId: CardID,
            decreeId?: CardID,
          ) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            return applyShootVariant(G, ctx, random, targetPlayerID, cardId, {
              sameLayerRequired: true,
              deathFaces: [1],
              moveFaces: [2, 3, 4, 5],
              extraOnMove: null,
              decreeId,
            });
          },
          client: false,
        },
        // 打出梦魇解封 - 翻开指定层的面朝下梦魇；后续由梦主选择发动/弃掉
        // 对照：docs/manual/04-action-cards.md 梦魇解封
        playNightmareUnlock: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID, layer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (cardId !== 'action_nightmare_unlock') return INVALID_MOVE;
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

        // --- 梦魇系统（梦主限定）---
        // 对照：docs/manual/07-nightmare-cards.md
        // 梦主行动阶段翻开指定层的梦魇牌（面朝下 → 面朝上）
        masterRevealNightmare: {
          move: ({ G, ctx }: MoveCtx, layer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            const ls = G.layers[layer];
            if (!ls || !ls.nightmareId) return INVALID_MOVE;
            if (ls.nightmareRevealed) return INVALID_MOVE;
            return {
              ...G,
              layers: { ...G.layers, [layer]: { ...ls, nightmareRevealed: true } },
            };
          },
          client: false,
        },
        // 梦主弃掉已翻开的梦魇（不发动效果）
        // 梦主弃掉未翻开的梦魇（W18-A：玩家打开金币金库后，梦主选择不发动）
        // 对照：docs/manual/03-game-flow.md 第 96-101 行
        masterDiscardHiddenNightmare: {
          move: ({ G, ctx }: MoveCtx, layer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            const result = applyDiscardHiddenNightmare(G, layer);
            if (result === null) return INVALID_MOVE;
            return result;
          },
          client: false,
        },
        masterDiscardNightmare: {
          move: ({ G, ctx }: MoveCtx, layer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            const ls = G.layers[layer];
            if (!ls || !ls.nightmareId || !ls.nightmareRevealed) return INVALID_MOVE;
            const discardedId = ls.nightmareId;
            return {
              ...G,
              layers: {
                ...G.layers,
                [layer]: {
                  ...ls,
                  nightmareId: null,
                  nightmareRevealed: false,
                  nightmareTriggered: true,
                },
              },
              usedNightmareIds: [...G.usedNightmareIds, discardedId],
            };
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
            const nid = ls.nightmareId;
            const next = applyNightmareEffect(G, layer, nid, random, params);
            if (next === INVALID_MOVE) return INVALID_MOVE;
            // 清除梦魇并计入已发动
            return {
              ...next,
              layers: {
                ...next.layers,
                [layer]: {
                  ...next.layers[layer]!,
                  nightmareId: null,
                  nightmareRevealed: false,
                  nightmareTriggered: true,
                },
              },
              usedNightmareIds: [...next.usedNightmareIds, nid],
            };
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (cardId !== 'action_shift') return INVALID_MOVE;
            if (targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
            const self = G.players[ctx.currentPlayer];
            const target = G.players[targetPlayerID];
            if (!self || !target) return INVALID_MOVE;
            if (!self.isAlive || !target.isAlive) return INVALID_MOVE;
            if (!self.hand.includes(cardId)) return INVALID_MOVE;
            // 盗梦者不能对梦主使用（但梦主对盗梦者可）
            if (self.faction === 'thief' && target.faction === 'master') {
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (cardId !== 'action_shoot_dream_transit') return INVALID_MOVE;
            const self = G.players[ctx.currentPlayer];
            if (!self || !self.isAlive) return INVALID_MOVE;
            if (!self.hand.includes(cardId)) return INVALID_MOVE;

            if (mode === 'shoot') {
              // 目标为玩家 ID
              if (typeof targetOrLayer !== 'string') return INVALID_MOVE;
              return applyShootVariant(G, ctx, random, targetOrLayer, cardId, {
                sameLayerRequired: true,
                deathFaces: [1],
                moveFaces: [2, 3, 4, 5],
                extraOnMove: null,
                decreeId,
              });
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (cardId !== 'action_shoot_king') return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (cardId !== 'action_shoot_armor') return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (cardId !== 'action_shoot_burst') return INVALID_MOVE;
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
        // 打出解封 - 盗梦者解锁同层心锁
        // 对照：docs/manual/04-action-cards.md 解封
        playUnlock: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            if (!player || !player.isAlive) return INVALID_MOVE;
            if (player.faction !== 'thief') return INVALID_MOVE;
            if (!player.hand.includes(cardId)) return INVALID_MOVE;
            // 摩羯·节奏 / 水瓶·同流：被动豁免解封次数限制
            // 黑洞·DM 世界观：上限提升至 2
            const effectiveMax = getEffectiveMaxUnlockPerTurn(G, G.maxUnlockPerTurn);
            if (
              player.successfulUnlocksThisTurn >= effectiveMax &&
              !isCapricornusRhythmActive(player) &&
              !isAquariusUnlimitedActive(player)
            ) {
              return INVALID_MOVE;
            }

            const currentLayer = player.currentLayer;
            const layerState = G.layers[currentLayer];
            if (!layerState || layerState.heartLockValue <= 0) return INVALID_MOVE;

            const s = discardCard(G, ctx.currentPlayer, cardId);
            return {
              ...s,
              pendingUnlock: {
                playerID: ctx.currentPlayer,
                layer: currentLayer,
                cardId,
              },
            };
          },
          client: false,
        },
        resolveUnlock: {
          move: ({ G }: MoveCtx) => {
            if (!G.pendingUnlock) return INVALID_MOVE;
            const unlockerId = G.pendingUnlock.playerID;
            let s = applyUnlockSuccess(G);
            // 译梦师技能：成功解封后抽 2 张
            s = applyInterpreterForeshadow(s, unlockerId);
            // 梦境猎手·满载：成功解封后抽 = 当层心锁数
            s = applyExtractorBounty(s, unlockerId);
            // abilities registry：运行 onUnlock passive（空间女王·监察 等）
            s = dispatchPassives(s, 'onUnlock').state;
            return s;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingUnlock) return INVALID_MOVE;
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
            const finalRoll = applyHaleyImpact(rawRoll);
            const shootResult =
              finalRoll === 1 ? 'kill' : finalRoll >= 2 && finalRoll <= 5 ? 'move' : 'miss';
            if (shootResult === 'kill') {
              const tp = s.players[targetID]!;
              const handover = tp.hand.slice(0, 2);
              s = {
                ...s,
                players: {
                  ...s.players,
                  [targetID]: {
                    ...tp,
                    isAlive: false,
                    deathTurn: s.turnNumber,
                    hand: tp.hand.slice(2),
                  },
                  [ctx.currentPlayer]: {
                    ...s.players[ctx.currentPlayer]!,
                    hand: [...s.players[ctx.currentPlayer]!.hand, ...handover],
                    shootCount: s.players[ctx.currentPlayer]!.shootCount + 1,
                  },
                },
              };
              s = movePlayerToLayer(s, targetID, 0);
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

        respondCancelUnlock: {
          move: ({ G }: MoveCtx) => {
            if (!G.pendingUnlock) return INVALID_MOVE;
            return applyUnlockCancel(G);
          },
          client: false,
        },
        passResponse: {
          move: ({ G }: MoveCtx) => G,
          client: false,
        },
        // 打出梦境穿梭剂 - 移动到相邻层
        // 对照：docs/manual/04-action-cards.md 梦境穿梭剂
        playDreamTransit: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID, targetLayer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            if (!player || !player.isAlive) return INVALID_MOVE;
            if (!player.hand.includes(cardId)) return INVALID_MOVE;
            if (targetLayer < 1 || targetLayer > 4) return INVALID_MOVE;
            if (!isAdjacent(player.currentLayer, targetLayer)) return INVALID_MOVE;

            const fromLayer = player.currentLayer;
            let s = discardCard(G, ctx.currentPlayer, cardId);
            s = movePlayerToLayer(s, ctx.currentPlayer, targetLayer);
            // 降世神通·顺流：移到更大数字层时抽 2 张
            s = applyHlninoFlow(s, ctx.currentPlayer, fromLayer, targetLayer);
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
            const self = G.players[ctx.currentPlayer];
            const target = G.players[targetPlayerID];
            if (!self || !target) return INVALID_MOVE;
            if (targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
            if (!self.isAlive || !target.isAlive) return INVALID_MOVE;
            if (!self.hand.includes(cardId)) return INVALID_MOVE;

            let s = discardCard(G, ctx.currentPlayer, cardId);
            const selfLayer = self.currentLayer;
            const targetLayer = target.currentLayer;
            const sameLayer = selfLayer === targetLayer;
            s = movePlayerToLayer(s, ctx.currentPlayer, targetLayer);
            s = movePlayerToLayer(s, targetPlayerID, selfLayer);
            // 天王星·苍穹世界观：每位因行动牌改变层数的盗梦者各触发一次（同层 KICK 不算改变）
            if (!sameLayer) {
              s = applyUranusFirmamentMoveDiscard(s, ctx.currentPlayer);
              s = applyUranusFirmamentMoveDiscard(s, targetPlayerID);
            }
            return incrementMoveCounter(s);
          },
          client: false,
        },
        // 打出念力牵引 - 把目标玩家拉到自己所在层
        // 对照：docs/manual/04-action-cards.md 念力牵引
        playTelekinesis: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID, targetPlayerID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
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
        // 打出梦境窥视 - 查看任意一层金库内容（MVP 简化：仅弃牌；UI 端从 state 自显示）
        // 对照：docs/manual/04-action-cards.md 梦境窥视
        playPeek: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID, targetLayer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            if (!player || !player.isAlive) return INVALID_MOVE;
            if (!player.hand.includes(cardId)) return INVALID_MOVE;
            if (targetLayer < 1 || targetLayer > 4) return INVALID_MOVE;
            // 该层必须有未开金库才值得窥视（否则拒绝）
            const hasVault = G.vaults.some((v) => v.layer === targetLayer);
            if (!hasVault) return INVALID_MOVE;
            let s = discardCard(G, ctx.currentPlayer, cardId);
            s = incrementMoveCounter(s);
            return s;
          },
          client: false,
        },

        // --- 贿赂（MVP：梦主派发 + 即刻结算） ---
        // 对照：docs/manual/03-game-flow.md 贿赂&背叛者
        masterDealBribe: {
          move: ({ G, ctx, random }: MoveCtx, targetPlayerID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            const target = G.players[targetPlayerID];
            if (!target) return INVALID_MOVE;
            if (!target.isAlive) return INVALID_MOVE;
            if (target.faction !== 'thief') return INVALID_MOVE;

            // 从 pool 随机抽 1 张
            const poolIdxs = G.bribePool
              .map((b, i) => ({ b, i }))
              .filter(({ b }) => b.status === 'inPool');
            if (poolIdxs.length === 0) return INVALID_MOVE;
            const shuffled = random.Shuffle(poolIdxs);
            const pick = shuffled[0]!;
            const bribe = pick.b;
            const isDeal = bribe.id.startsWith('bribe-deal-');

            // 更新贿赂状态：派出 → dealt（命中 DEAL 转 deal）
            const nextPool = G.bribePool.map((b, i) =>
              i === pick.i
                ? {
                    ...b,
                    status: (isDeal ? 'deal' : 'dealt') as BribeSetup['status'],
                    heldBy: targetPlayerID,
                    originalOwnerId: targetPlayerID,
                  }
                : b,
            );

            let s: SetupState = {
              ...G,
              bribePool: nextPool,
              players: {
                ...G.players,
                [targetPlayerID]: {
                  ...target,
                  bribeReceived: target.bribeReceived + 1,
                  // DEAL 立即转阵营为梦主
                  faction: isDeal ? ('master' as Faction) : target.faction,
                },
              },
            };
            s = incrementMoveCounter(s);
            return s;
          },
          client: false,
        },

        // 皇城·重金（W16-B）：派发贿赂时可指定 1 张牌（替代随机抽取）
        // 对照：cards-data.json dm_imperial_city
        masterDealBribeImperial: {
          move: ({ G, ctx }: MoveCtx, targetPlayerID: string, poolIndex: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            if (!canImperialPickBribe(G, ctx.currentPlayer, targetPlayerID, poolIndex))
              return INVALID_MOVE;

            const target = G.players[targetPlayerID]!;
            const bribe = G.bribePool[poolIndex]!;
            const isDeal = bribe.id.startsWith('bribe-deal-');

            const nextPool = G.bribePool.map((b, i) =>
              i === poolIndex
                ? {
                    ...b,
                    status: (isDeal ? 'deal' : 'dealt') as BribeSetup['status'],
                    heldBy: targetPlayerID,
                    originalOwnerId: targetPlayerID,
                  }
                : b,
            );

            let s: SetupState = {
              ...G,
              bribePool: nextPool,
              players: {
                ...G.players,
                [targetPlayerID]: {
                  ...target,
                  bribeReceived: target.bribeReceived + 1,
                  faction: isDeal ? ('master' as Faction) : target.faction,
                },
              },
            };
            s = incrementMoveCounter(s);
            return s;
          },
          client: false,
        },

        // 密道·传送（W16-B）：弃 1 穿梭剂送任一盗梦者到迷失层。回合限 2 次。
        // 对照：cards-data.json dm_secret_passage
        playSecretPassageTeleport: {
          move: ({ G, ctx }: MoveCtx, targetPlayerID: string, transitCardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            const result = applySecretPassageTeleport(
              G,
              ctx.currentPlayer,
              targetPlayerID,
              transitCardId,
            );
            if (result === null) return INVALID_MOVE;
            return incrementMoveCounter(result);
          },
          client: false,
        },

        // 天王星·权力（W16-B）：每未派发贿赂可移动 1 个盗梦者到指定层（非迷失层）
        // 对照：cards-data.json dm_uranus_firmament
        useUranusPower: {
          move: ({ G, ctx }: MoveCtx, targetPlayerID: string, targetLayer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            const result = applyUranusPower(
              G,
              ctx.currentPlayer,
              targetPlayerID,
              targetLayer as Layer,
            );
            if (result === null) return INVALID_MOVE;
            return incrementMoveCounter(result);
          },
          client: false,
        },

        // 冥王星·业火（W16-B）：弃 1 → 所有手牌<2 的盗梦者抽 2
        // 对照：cards-data.json dm_pluto_hell
        usePlutoBurning: {
          move: ({ G, ctx }: MoveCtx, discardCardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            const result = applyPlutoBurning(G, ctx.currentPlayer, discardCardId);
            if (result === null) return INVALID_MOVE;
            return incrementMoveCounter(result);
          },
          client: false,
        },

        // 火星·杀戮（W16-C）：弃 1 解封 → 发动指定层的梦魇牌效果（无需翻开）
        // 对照：cards-data.json dm_mars_battlefield
        useMarsKill: {
          move: ({ G, ctx, random }: MoveCtx, layer: number, params?: Record<string, unknown>) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            if (!canMarsKill(G, ctx.currentPlayer)) return INVALID_MOVE;
            const ls = G.layers[layer];
            if (!ls || !ls.nightmareId) return INVALID_MOVE;
            const nid = ls.nightmareId;
            // 弃 1 解封
            const afterDiscard = applyMarsKillDiscardUnlock(G, ctx.currentPlayer);
            if (afterDiscard === null) return INVALID_MOVE;
            // 发动梦魇效果
            const next = applyNightmareEffect(afterDiscard, layer, nid, random, params);
            if (next === INVALID_MOVE) return INVALID_MOVE;
            // 清除该层梦魇并计入已发动
            return incrementMoveCounter({
              ...next,
              layers: {
                ...next.layers,
                [layer]: {
                  ...next.layers[layer]!,
                  nightmareId: null,
                  nightmareRevealed: false,
                  nightmareTriggered: true,
                },
              },
              usedNightmareIds: [...next.usedNightmareIds, nid],
            });
          },
          client: false,
        },

        // 土星·领地世界观（W16-C）：持贿赂的盗梦者出牌阶段免费移动 1 次到相邻层
        // 对照：cards-data.json dm_saturn_territory 世界观
        useSaturnFreeMove: {
          move: ({ G, ctx }: MoveCtx, targetLayer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const result = applySaturnFreeMove(G, ctx.currentPlayer, targetLayer as Layer);
            if (result === null) return INVALID_MOVE;
            return incrementMoveCounter(result);
          },
          client: false,
        },

        // 火星·战场世界观（W16-D）：弃 2 非 SHOOT → 弃牌堆取 1 SHOOT 入手
        // 对照：cards-data.json dm_mars_battlefield 世界观
        useMarsBattlefield: {
          move: (
            { G, ctx }: MoveCtx,
            discardCard1: CardID,
            discardCard2: CardID,
            targetShootCardId: CardID,
          ) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const result = applyMarsBattlefieldExchange(
              G,
              ctx.currentPlayer,
              [discardCard1, discardCard2],
              targetShootCardId,
            );
            if (result === null) return INVALID_MOVE;
            return incrementMoveCounter(result);
          },
          client: false,
        },

        // --- 主动技能 ---
        // 棋局·易位（梦主限定）：交换两个未打开的金库位置，perGame 最多 2 次
        // 对照：packages/game-engine/src/engine/skills.ts applyChessTranspose
        useChessTranspose: {
          move: ({ G, ctx }: MoveCtx, vaultIdx1: number, vaultIdx2: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            const next = applyChessTranspose(G, ctx.currentPlayer, vaultIdx1, vaultIdx2);
            // applyChessTranspose 拒绝时返回原 state（无变化）
            if (next === G) return INVALID_MOVE;
            return next;
          },
          client: false,
        },

        // 打出嫁接 - 抽 3 张 → 从手中选 2 张放回牌库顶（两阶段）
        // 对照：docs/manual/04-action-cards.md 嫁接
        playGraft: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft) return INVALID_MOVE;
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
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
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

        // 打出时间风暴 - 从牌库顶弃 10 张，该牌效果结算后移出游戏
        // 对照：docs/manual/04-action-cards.md 时间风暴
        // MVP：弃牌堆直接收到被弃的 10 张；"从手中弃掉同样触发效果"暂不处理
        playTimeStorm: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            if (!player || !player.isAlive) return INVALID_MOVE;
            if (cardId !== 'action_time_storm') return INVALID_MOVE;
            if (!player.hand.includes(cardId)) return INVALID_MOVE;

            // 从手牌中移除该牌（注：此牌效果结算后"移出游戏"，不入弃牌堆）
            const handIdx = player.hand.indexOf(cardId);
            const newHand = [...player.hand];
            newHand.splice(handIdx, 1);

            // 从牌库顶弃 10 张（不足则全弃）
            const flipCount = Math.min(10, G.deck.cards.length);
            const flipped = G.deck.cards.slice(0, flipCount);
            const remaining = G.deck.cards.slice(flipCount);

            const s: SetupState = {
              ...G,
              players: {
                ...G.players,
                [ctx.currentPlayer]: { ...player, hand: newHand },
              },
              deck: {
                cards: remaining,
                discardPile: [...G.deck.discardPile, ...flipped],
              },
            };
            return incrementMoveCounter(s);
          },
          client: false,
        },

        // 打出凭空造物 - 从牌库顶抽2张牌
        // 对照：docs/manual/04-action-cards.md 凭空造物
        playCreation: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            if (!player || !player.isAlive) return INVALID_MOVE;
            if (!player.hand.includes(cardId)) return INVALID_MOVE;

            let s = discardCard(G, ctx.currentPlayer, cardId);
            s = drawCards(s, ctx.currentPlayer, 2);
            return incrementMoveCounter(s);
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
            return next;
          },
          client: false,
        },

        // 露娜·月蚀：弃 2 张 SHOOT → 击杀同层任意玩家 → 翻面
        // 对照：docs/manual/05-dream-thieves.md 露娜
        playLunaEclipse: {
          move: ({ G, ctx }: MoveCtx, shootCardIds: CardID[], targetID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (!Array.isArray(shootCardIds)) return INVALID_MOVE;
            const next = applyLunaEclipse(G, ctx.currentPlayer, shootCardIds, targetID);
            if (next === null) return INVALID_MOVE;
            return incrementMoveCounter(next);
          },
          client: false,
        },

        // 盖亚·大地：令同层其余玩家移到 ±1 层（限 2 次/回合）
        // 对照：docs/manual/05-dream-thieves.md 盖亚
        playGaiaShift: {
          move: ({ G, ctx }: MoveCtx, picks: Record<string, -1 | 1>) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (!picks || typeof picks !== 'object') return INVALID_MOVE;
            const next = applyGaiaShift(G, ctx.currentPlayer, picks);
            if (next === null) return INVALID_MOVE;
            return incrementMoveCounter(next);
          },
          client: false,
        },

        // 达尔文·进化：抽牌库顶 2 + 还 2 任意顺序到顶（限 1 次/回合）
        // 对照：docs/manual/05-dream-thieves.md 达尔文
        playDarwinEvolution: {
          move: ({ G, ctx }: MoveCtx, returnCards: CardID[]) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (!Array.isArray(returnCards)) return INVALID_MOVE;
            const next = applyDarwinEvolution(G, ctx.currentPlayer, returnCards);
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            const next = applyShadeFollow(G, ctx.currentPlayer);
            if (next === null) return INVALID_MOVE;
            return incrementMoveCounter(next);
          },
          client: false,
        },

        // 欺诈师·盗心：抽 target 1-2 张 + 还回等量
        // 对照：docs/manual/05-dream-thieves.md 欺诈师
        playForgerExchange: {
          move: ({ G, ctx }: MoveCtx, exchange: ForgerExchange) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            const next = applyForgerExchange(G, ctx.currentPlayer, exchange);
            if (next === null) return INVALID_MOVE;
            return incrementMoveCounter(next);
          },
          client: false,
        },

        // R24：欺诈师·盗心（单机盲抽版）—— 固定抽 1 张，用 BGIO Random 在服务端
        // 随机挑选，避免客户端能看到 target 手牌即违反隐藏信息原则。
        // 对照：docs/manual/05-dream-thieves.md 欺诈师 · applyForgerExchange
        playForgerExchangeSingle: {
          move: ({ G, ctx, random }: MoveCtx, targetID: string, returnedCardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingLibra) return INVALID_MOVE;
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
        // 单机版放宽：不检查 ctx.currentPlayer，允许任一参与方代发（含 worker Bot
        // 代 target 在 bonder 回合内补完）。split 合法性由 libraValidateSplit 守护。
        resolveLibraSplit: {
          move: ({ G }: MoveCtx, pile1: CardID[], pile2: CardID[]) => {
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
        // 单机版放宽：不检查 ctx.currentPlayer（理由同 step 2）。参与方由 pendingLibra 守护。
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

        // 筑梦师·迷宫：弃 1 SHOOT 类牌，标记同层目标"被困"
        // 对照：docs/manual/05-dream-thieves.md 筑梦师
        playArchitectMaze: {
          move: ({ G, ctx }: MoveCtx, discardCardId: CardID, targetID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            const self = G.players[ctx.currentPlayer];
            const target = G.players[targetID];
            if (!self || !target) return INVALID_MOVE;
            if (self.characterId !== 'thief_architect') return INVALID_MOVE;
            if (!self.isAlive || !target.isAlive) return INVALID_MOVE;
            if (targetID === ctx.currentPlayer) return INVALID_MOVE;
            if (self.currentLayer !== target.currentLayer) return INVALID_MOVE;
            if (!isShootClassCard(discardCardId)) return INVALID_MOVE;
            if (!self.hand.includes(discardCardId)) return INVALID_MOVE;
            if (!canUseSkill(self, ARCHITECT_SKILL_ID, 'ownTurnOncePerTurn')) return INVALID_MOVE;

            let s = markSkillUsed(G, ctx.currentPlayer, ARCHITECT_SKILL_ID);
            s = discardCard(s, ctx.currentPlayer, discardCardId);
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

        // 阿波罗·崇拜：随机抽取受贿盗梦者 1 张手牌
        // 对照：docs/manual/05-dream-thieves.md 阿波罗
        playApolloWorship: {
          move: ({ G, ctx, random }: MoveCtx, targetID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            // 用 D6 注入随机性（保证 BGIO 确定性）
            const pickIdx = random.D6() - 1;
            const next = applyApolloWorship(G, ctx.currentPlayer, targetID, pickIdx);
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
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
            return setTurnPhase(r.state, 'discard');
          },
          client: false,
        },

        // 雅典娜·惊叹：展示 4 手牌 + 1 牌库顶；5 张同名 → 击杀同层 1 玩家
        // 对照：docs/manual/05-dream-thieves.md 雅典娜
        playAthenaAwe: {
          move: ({ G, ctx }: MoveCtx, shownHandIds: CardID[], targetID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (!Array.isArray(shownHandIds)) return INVALID_MOVE;
            const next = applyAthenaAwe(G, ctx.currentPlayer, shownHandIds, targetID);
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            const next = applyChemistRefine(G, ctx.currentPlayer, discardCardId);
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
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (!Array.isArray(discardIds)) return INVALID_MOVE;
            const next = applyLordOfWarBlackMarket(
              G,
              ctx.currentPlayer,
              discardIds,
              pickFromDiscard,
            );
            if (next === null) return INVALID_MOVE;
            return next;
          },
          client: false,
        },

        // 灵魂牧师·拯救：弃 1 手牌 → 复活迷失层玩家到自己层 + 取其手牌
        // 对照：docs/manual/05-dream-thieves.md 灵魂牧师
        playPaprikSalvation: {
          move: ({ G, ctx }: MoveCtx, discardCardId: CardID, targetID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            const next = applyPaprikSalvation(G, ctx.currentPlayer, discardCardId, targetID);
            if (next === null) return INVALID_MOVE;
            return next;
          },
          client: false,
        },

        // 穿行者·支助：将所有手牌（≥1）给目标，自己移到目标层
        // 对照：docs/manual/05-dream-thieves.md 穿行者
        playTouristAssist: {
          move: ({ G, ctx }: MoveCtx, targetPlayerID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            const next = applyTouristAssist(G, ctx.currentPlayer, targetPlayerID);
            if (next === null) return INVALID_MOVE;
            return next;
          },
          client: false,
        },

        // --- 弃牌阶段 ---
        doDiscard: {
          move: ({ G, ctx, events }: MoveCtx, cardIds: CardID[]) => {
            if (!guardTurnPhase(G, ctx, 'discard')) return INVALID_MOVE;
            const next = discardToLimit(G, ctx.currentPlayer, cardIds);
            // 弃牌完成 → 切下一回合
            events.endTurn();
            return next;
          },
          client: false,
        },
        skipDiscard: {
          move: ({ G, ctx, events }: MoveCtx) => {
            if (!guardTurnPhase(G, ctx, 'discard')) return INVALID_MOVE;
            // 手牌未超限则允许跳过
            const player = G.players[ctx.currentPlayer];
            if (player && player.hand.length > 5) return INVALID_MOVE;
            events.endTurn();
            return G;
          },
          client: false,
        },
      },
    },

    endgame: {
      next: null,
    },
  },

  // 游戏结束条件
  endIf: ({ G }: { G: SetupState }) => {
    if (!G?.vaults) return undefined;

    const secretVault = G.vaults.find((v) => v.contentType === 'secret');
    if (secretVault?.isOpened) {
      return { winner: 'thief' as Faction, reason: 'secret_vault_opened' };
    }

    const aliveThieves = G.playerOrder.filter(
      (id) => G.players[id]?.faction === 'thief' && G.players[id]?.isAlive,
    );
    if (aliveThieves.length === 0) {
      return { winner: 'master' as Faction, reason: 'all_thieves_dead' };
    }

    // 港口世界观：≥2 金库打开且秘密未开 → 梦主胜
    // 对照：cards-data.json dm_harbor 世界观
    if (checkHarborWin(G)) {
      return { winner: 'master' as Faction, reason: 'harbor_two_vaults' };
    }

    // 海王星·泓洋世界观：金币金库被打开 → 梦主胜
    // 对照：cards-data.json dm_neptune_ocean 世界观
    if (checkNeptuneWin(G)) {
      return { winner: 'master' as Faction, reason: 'neptune_coin_opened' };
    }

    // 牌库耗尽 + 秘密金库未开 → 梦主胜
    // 对照：docs/manual/03-game-flow.md 第 20 行
    if (G.deck && G.deck.cards.length === 0 && G.phase === 'playing') {
      return { winner: 'master' as Faction, reason: 'deck_exhausted' };
    }

    return undefined;
  },
};

function isAdjacent(from: number, to: number): boolean {
  return Math.abs(from - to) === 1 && from >= 1 && from <= 4 && to >= 1 && to <= 4;
}

/**
 * 梦魇效果分发
 * 对照：docs/manual/07-nightmare-cards.md
 * 已实现：饥饿撕咬 / 绝望风暴 / 深空坠落 / 致命漩涡
 * 待后续：回音萦绕 / 邪念瘟疫
 */
function applyNightmareEffect(
  G: SetupState,
  layer: number,
  nid: CardID,
  random: BGIORandom,
  _params?: Record<string, unknown>,
): SetupState | typeof INVALID_MOVE {
  const ls = G.layers[layer];
  if (!ls) return INVALID_MOVE;

  if (nid === 'nightmare_despair_storm') {
    // 从牌库顶弃 10 张；+5 × 其他已开金库数
    const openedOther = G.vaults.filter((v) => v.isOpened && v.layer !== layer).length;
    const target = 10 + openedOther * 5;
    const eff = Math.min(target, G.deck.cards.length);
    const dropped = G.deck.cards.slice(0, eff);
    return {
      ...G,
      deck: {
        cards: G.deck.cards.slice(eff),
        discardPile: [...G.deck.discardPile, ...dropped],
      },
    };
  }

  if (nid === 'nightmare_space_fall') {
    // 该层所有盗梦者掷 1 骰：5/6 或当前层数 → 迷失层；否则移到结果数字对应层
    let s = G;
    const thieves = [...ls.playersInLayer].filter((pid) => {
      const p = s.players[pid];
      return p && p.faction === 'thief' && p.isAlive;
    });
    for (const pid of thieves) {
      const roll = random.D6();
      if (roll === 5 || roll === 6 || roll === layer) {
        s = movePlayerToLayer(s, pid, 0);
      } else if (roll >= 1 && roll <= 4) {
        s = movePlayerToLayer(s, pid, roll);
      }
    }
    return s;
  }

  if (nid === 'nightmare_vortex') {
    // 当层玩家 → 迷失层（保留手牌）；其余玩家移到当层 + 弃所有手牌
    let s = G;
    const onLayer = [...ls.playersInLayer];
    for (const pid of onLayer) {
      const p = s.players[pid];
      if (!p || !p.isAlive) continue;
      s = movePlayerToLayer(s, pid, 0);
    }
    // 再处理其他层玩家
    for (const pid of G.playerOrder) {
      const p = s.players[pid];
      if (!p || !p.isAlive) continue;
      if (p.currentLayer === 0) continue;
      if (p.currentLayer === layer) continue;
      const hand = p.hand;
      s = {
        ...s,
        players: { ...s.players, [pid]: { ...p, hand: [] } },
        deck: { ...s.deck, discardPile: [...s.deck.discardPile, ...hand] },
      };
      s = movePlayerToLayer(s, pid, layer);
    }
    return s;
  }

  if (nid === 'nightmare_echo') {
    // 梦主选一层：恢复该层原有心锁数 或 当前心锁数 +1
    // params: { targetLayer: number, action: 'restore' | 'add' }
    const targetLayer = _params?.targetLayer as number | undefined;
    const action = _params?.action as 'restore' | 'add' | undefined;
    if (!targetLayer || !action) return INVALID_MOVE;
    const tls = G.layers[targetLayer];
    if (!tls) return INVALID_MOVE;
    let newValue: number;
    if (action === 'add') {
      newValue = tls.heartLockValue + 1;
    } else {
      const cfg = PLAYER_COUNT_CONFIGS[G.playerOrder.length];
      const original = cfg?.heartLocks[targetLayer - 1] ?? tls.heartLockValue;
      newValue = Math.max(tls.heartLockValue, original);
    }
    return {
      ...G,
      layers: { ...G.layers, [targetLayer]: { ...tls, heartLockValue: newValue } },
    };
  }

  if (nid === 'nightmare_plague') {
    // 梦主派发贿赂给当层盗梦者（bribedTargets 指定）；未派发的 → 迷失层
    // params: { bribedTargets: string[] }
    const bribed = new Set((_params?.bribedTargets as string[]) ?? []);
    let s = G;
    const layerThieves = [...ls.playersInLayer].filter((pid) => {
      const p = s.players[pid];
      return p && p.faction === 'thief' && p.isAlive;
    });
    for (const pid of layerThieves) {
      if (bribed.has(pid)) {
        // 从 pool 抽 1 张随机贿赂；空池则视为未派发 → 入迷失层（manual 说明）
        const poolIdxs = s.bribePool
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => b.status === 'inPool');
        if (poolIdxs.length === 0) {
          s = movePlayerToLayer(s, pid, 0);
          continue;
        }
        const pickIdx = (random.Die(poolIdxs.length) - 1) % poolIdxs.length;
        const pick = poolIdxs[pickIdx]!;
        const bribe = pick.b;
        const isDeal = bribe.id.startsWith('bribe-deal-');
        const target = s.players[pid]!;
        const nextPool = s.bribePool.map((b, i) =>
          i === pick.i
            ? {
                ...b,
                status: (isDeal ? 'deal' : 'dealt') as BribeSetup['status'],
                heldBy: pid,
                originalOwnerId: pid,
              }
            : b,
        );
        s = {
          ...s,
          bribePool: nextPool,
          players: {
            ...s.players,
            [pid]: {
              ...target,
              bribeReceived: target.bribeReceived + 1,
              faction: isDeal ? ('master' as Faction) : target.faction,
            },
          },
        };
      } else {
        s = movePlayerToLayer(s, pid, 0);
      }
    }
    return s;
  }

  if (nid === 'nightmare_hunger_bite') {
    // 该层所有玩家弃 3 张手牌；不足 3 张 → 进入迷失层（保留手牌）
    // 包含梦主
    let s = G;
    const allOnLayer = [...ls.playersInLayer];
    for (const pid of allOnLayer) {
      const p = s.players[pid];
      if (!p || !p.isAlive) continue;
      if (p.hand.length >= 3) {
        // 弃前 3 张（MVP 策略；真实应让玩家选）
        const drop = p.hand.slice(0, 3);
        const keep = p.hand.slice(3);
        s = {
          ...s,
          players: { ...s.players, [pid]: { ...p, hand: keep } },
          deck: { ...s.deck, discardPile: [...s.deck.discardPile, ...drop] },
        };
      } else {
        // 不足 3 张 → 入迷失层（保留手牌，不视为被梦主击杀）
        s = movePlayerToLayer(s, pid, 0);
      }
    }
    return s;
  }

  // 其他梦魇待后续实现
  return INVALID_MOVE;
}

/**
 * 死亡宣言卡 → 附加死亡骰面
 * 对照：docs/manual/04-action-cards.md 死亡宣言
 * 展示式使用（不弃掉），每次 SHOOT 最多 1 张
 */
function deathFaceFromDecree(cardId: CardID | undefined): number | null {
  if (!cardId) return null;
  if (cardId === 'action_death_decree_3') return 3;
  if (cardId === 'action_death_decree_4') return 4;
  if (cardId === 'action_death_decree_5') return 5;
  return null;
}

/** 校验死亡宣言：在手中 + 是合法 decree；合法时返回骰面 */
function validateDecree(
  G: SetupState,
  shooterID: string,
  decreeId: CardID | undefined,
): number | null | 'INVALID' {
  if (!decreeId) return null; // 无宣言 OK
  const shooter = G.players[shooterID];
  if (!shooter) return 'INVALID';
  const face = deathFaceFromDecree(decreeId);
  if (face === null) return 'INVALID';
  if (!shooter.hand.includes(decreeId)) return 'INVALID';
  return face;
}

interface ShootVariantOpts {
  sameLayerRequired: boolean;
  deathFaces: number[];
  moveFaces: number[];
  extraOnMove: 'discard_unlocks' | 'discard_shoots' | null;
  decreeId?: CardID; // 死亡宣言展示（不弃，附加死亡骰面）
  /** 骰值前置修饰 hook（用于哈雷·冲击 -2 等场景；优先级低于灵雕师/天蝎/金牛） */
  dicePreModifier?: (baseRoll: number) => number;
}

/** SHOOT 变体共享结算：kill/move/miss + 可选 on-move 弃牌副作用 + 死亡宣言
 *  对照：docs/manual/04-action-cards.md SHOOT 变体 + 死亡宣言
 */
function applyShootVariant(
  G: SetupState,
  ctx: BGIOCtx,
  random: BGIORandom,
  targetPlayerID: string,
  cardId: CardID,
  opts: ShootVariantOpts,
): SetupState | typeof INVALID_MOVE {
  const shooter = G.players[ctx.currentPlayer];
  const target = G.players[targetPlayerID];
  if (!shooter || !target) return INVALID_MOVE;
  if (targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
  if (!target.isAlive) return INVALID_MOVE;
  if (!shooter.hand.includes(cardId)) return INVALID_MOVE;
  if (opts.sameLayerRequired && shooter.currentLayer !== target.currentLayer) {
    // 摩羯·节奏：手牌数 >= 所在层数字时，SHOOT 类不受层数限制
    // 恐怖分子·远程：被动免除层数限制
    // 木星·巅峰世界观：SHOOT 类可对相邻层使用
    const jupiterRelaxed =
      isJupiterPeakWorldActive(G) &&
      isJupiterPeakLayerOK(shooter.currentLayer, target.currentLayer);
    if (
      !isCapricornusRhythmActive(shooter) &&
      !isTerroristCrossLayerActive(shooter) &&
      !jupiterRelaxed
    ) {
      return INVALID_MOVE;
    }
  }

  // 死亡宣言校验 + 附加死亡面
  const decreeCheck = validateDecree(G, ctx.currentPlayer, opts.decreeId);
  if (decreeCheck === 'INVALID') return INVALID_MOVE;
  const deathFaces = decreeCheck !== null ? [...opts.deathFaces, decreeCheck] : opts.deathFaces;
  // abilities registry：触发 onBeforeShoot passive（被动修饰仅作事件记录）
  const preShootState = dispatchPassives(G, 'onBeforeShoot').state;
  const baseRoll = random.D6();

  // === 角色 SHOOT 修饰链 ===
  // W12 Tier B: 天蝎·毒针 / 金牛·号角
  // W13 Tier A: 灵雕师·雕琢（最高优先级，override 不可改）
  // hook 注入: opts.diceModifierHint 用于哈雷·冲击的免费 SHOOT
  let result: 'kill' | 'move' | 'miss';
  let preState: SetupState = preShootState;

  // 灵雕师·雕琢：override 模式，直接用 target 手牌数当骰值
  if (shooter.characterId === 'thief_soul_sculptor') {
    const finalRoll = applySoulSculptorCarve(target.hand.length);
    result = resolveShootCustom(finalRoll, deathFaces, opts.moveFaces);
  } else if (
    shooter.characterId === 'thief_scorpius' &&
    canUseSkill(shooter, SCORPIUS_SKILL_ID, 'ownTurnOncePerTurn')
  ) {
    const roll2 = random.D6();
    const finalRoll = applyScorpiusPoison(baseRoll, roll2);
    result = resolveShootCustom(finalRoll, deathFaces, opts.moveFaces);
    preState = markSkillUsed(preState, ctx.currentPlayer, SCORPIUS_SKILL_ID);
  } else if (shooter.characterId === 'thief_taurus') {
    // 金牛：先按 target 骰算 base result；若非 kill 再掷 self 骰看是否 override 为 kill
    const baseResult = resolveShootCustom(baseRoll, deathFaces, opts.moveFaces);
    if (baseResult !== 'kill') {
      const selfRoll = random.D6();
      result = applyTaurusHorn(baseRoll, selfRoll) === 'kill' ? 'kill' : baseResult;
    } else {
      result = baseResult;
    }
  } else if (opts.dicePreModifier) {
    // hook：哈雷·冲击附带 -2 修饰（仅由解封触发的免费 SHOOT 使用）
    const finalRoll = opts.dicePreModifier(baseRoll);
    result = resolveShootCustom(finalRoll, deathFaces, opts.moveFaces);
  } else {
    result = resolveShootCustom(baseRoll, deathFaces, opts.moveFaces);
  }

  // 木星·雷霆：梦主使用 SHOOT 类，目标骰 < 梦主层 → 直接击杀
  // 对照：cards-data.json dm_jupiter_peak 雷霆
  if (
    result !== 'kill' &&
    shouldJupiterThunderKill(shooter.characterId, shooter.currentLayer, baseRoll)
  ) {
    result = 'kill';
  }

  let s = discardCard(preState, ctx.currentPlayer, cardId);

  if (result === 'kill') {
    const tp = s.players[targetPlayerID]!;
    const handover = tp.hand.slice(0, 2);
    s = {
      ...s,
      players: {
        ...s.players,
        [targetPlayerID]: {
          ...tp,
          isAlive: false,
          deathTurn: s.turnNumber,
          hand: tp.hand.slice(2),
        },
        [ctx.currentPlayer]: {
          ...s.players[ctx.currentPlayer]!,
          hand: [...s.players[ctx.currentPlayer]!.hand, ...handover],
          shootCount: s.players[ctx.currentPlayer]!.shootCount + 1,
        },
      },
    };
    s = movePlayerToLayer(s, targetPlayerID, 0);
    // abilities registry：击杀后触发 onKilled passive（射手·心锁等待此时机）
    s = dispatchPassives(s, 'onKilled').state;
  } else if (result === 'move') {
    // on-move 副作用：弃目标特定手牌
    if (opts.extraOnMove) {
      const tp = s.players[targetPlayerID]!;
      const keep: CardID[] = [];
      const dropped: CardID[] = [];
      for (const id of tp.hand) {
        const shouldDrop =
          opts.extraOnMove === 'discard_unlocks'
            ? id === 'action_unlock'
            : id === 'action_shoot' ||
              id === 'action_shoot_king' ||
              id === 'action_shoot_armor' ||
              id === 'action_shoot_burst' ||
              id === 'action_shoot_dream_transit';
        (shouldDrop ? dropped : keep).push(id);
      }
      if (dropped.length > 0) {
        s = {
          ...s,
          players: { ...s.players, [targetPlayerID]: { ...tp, hand: keep } },
          deck: { ...s.deck, discardPile: [...s.deck.discardPile, ...dropped] },
        };
      }
    }
    // 相邻层移动（1<->2, 2<->3, 3<->4；4 向下，1 向上）
    const cur = target.currentLayer;
    const dir = cur >= 4 ? -1 : 1;
    const nl = Math.max(1, Math.min(4, cur + dir));
    s = movePlayerToLayer(s, targetPlayerID, nl);
  }

  // abilities registry：SHOOT 结算完成后触发 onAfterShoot passive（处女·完美监听 roll=6）
  s = dispatchPassives(s, 'onAfterShoot').state;
  return incrementMoveCounter(s);
}
