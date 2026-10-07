// BGIO Game 对象 - 盗梦都市主游戏定义
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

import { INVALID_MOVE } from './engine/invalidMove.js';
import {
  createInitialState,
  type SetupState,
  type PlayerSetup,
  type VaultDecisionChoice,
} from './setup.js';
import { migrateGameState } from './migrations.js';
import { PLAYER_COUNT_CONFIGS, BASE_DRAW_COUNT, HAND_LIMIT } from './config.js';
import {
  drawCards,
  discardCard,
  discardCards,
  discardToLimit,
  beginTurn,
  setTurnPhase,
  movePlayerToLayer,
  incrementMoveCounter,
  applyUnlockSuccess,
  applyUnlockCancel,
  setLayerHeartLock,
  recordCardPlayed,
} from './moves.js';
import { killPlayer, sendToLimbo } from './engine/death.js';
import { resolveShootCustom } from './dice.js';
import { MASTER_POOL, THIEF_POOL } from './characterPools.js';
import {
  applyPointmanAssault,
  applyInterpreterForeshadow,
  applyChessTranspose,
  applyTouristAssist,
  applyLeoKingdom,
  isCapricornusRhythmActive,
  applyChemistRefine,
  applyChemistInject,
  applyAquariusCoherence,
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
  applyShadeFollow,
  applyExtractorBounty,
  applyForgerExchange,
  isTerroristCrossLayerActive,
  applyGeminiSync,
  applyGeminiChoice,
  applyLunaEclipse,
  applyLunaFullMoon,
  applyPiscesBlessing,
  canAriesStardustTrigger,
  findAliveAriesID,
  applyAriesStardustDiscard,
  applyAriesStardustReveal,
  applyGaiaShift,
  applyDarwinEvolution,
  canMakeSuccessfulUnlock,
  checkHarborWin,
  checkNeptuneWin,
  isJupiterPeakWorldActive,
  isJupiterPeakLayerOK,
  shouldJupiterThunderKill,
  applyM4CarbineModifier,
  isDreamMaster,
  isOutwardThief,
  canImperialPickFromPool,
  dealBribeCard,
  inPoolBribeIndexes,
  discardNightmareOnLayer,
  applySecretPassageTeleport,
  applyUranusPower,
  applyPlutoBurning,
  endDrawPhase,
  REVIVED_SELF_THIS_TURN_KEY,
  canMarsKill,
  applyMarsKillDiscardUnlock,
  isPlutoHellWorldActive,
  applyPlutoHellLostCheck,
  applySaturnFreeMove,
  applyUranusFirmamentMoveDiscard,
  applyMarsBattlefieldExchange,
  applyMercuryRouteExtraFailBribe,
  applySudgerVerdict,
  SUDGER_SKILL_ID,
  applySagittariusHeartLock,
  SAGITTARIUS_HEART_LOCK_SKILL_ID,
  canUseSagittariusHeartLock,
  applySpaceQueenStashTop,
  settleSpaceQueenObserve,
  settleAriesExtraDraw,
  settleVirgoPerfect,
  applyBlackHoleLevy,
  applyBlackHoleAbsorb,
  applyImperialCityWorldShoot,
  applyKickEffect,
  applyRevive,
  applyVenusMirrorWorld,
  getMidsummerExtraDraws,
  getMidsummerWorldThiefBonus,
  getCancerAuraBonus,
  isCancerShelterActive,
  isMazeBlocked,
  applyBlackSwanTour,
  applyVenusDouble,
  applyMercuryReverse,
  jokerDrawCount,
  applyVirgoResurrect,
  applyVirgoDrawTwo,
  applyVirgoTeleport,
  type VirgoPerfectChoice,
  canPiscesEvade,
  applyPiscesEvade,
  applyAthenaWit,
  ATHENA_WIT_SKILL_ID,
} from './engine/skills.js';
import { shiftGuardAndRestore } from './engine/abilities/shift-guard.js';
import { withSettleGate } from './engine/settleGate.js';
import { denyAction } from './engine/actionRights.js';
import { isCardForPlayMove } from './engine/playCardKinds.js';
import { viewFor } from './engine/matchView.js';
import { matchOutcome } from './engine/outcome.js';
import { describeMatchEvents } from './engine/matchEvents.js';
import { isRecordOf, isString, isStringArray } from './engine/argShape.js';
import {
  openResponseWindow,
  respondToWindow,
  passOnResponse,
} from './engine/abilities/response-chain.js';
import { MATCH_MAX_PLAYERS, MATCH_MIN_PLAYERS } from '@icgame/shared';
import type { CardID, Faction, Layer } from '@icgame/shared';
import type { GameDef } from './runner/matchRunner.js';

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

// --- 内部 helper：选出这次要派的贿赂牌 ---
// 指定了下标（皇城·重金，派发贿赂时可指定 1 张）：梦主必须是皇城、该张必须还在池里，否则非法；
// 没指定：从池里还没派出的牌里随机抽 1 张，池里一张都没有时返回 null。
function resolveBribePick(
  G: SetupState,
  random: BGIORandom,
  poolIndex: unknown,
): number | null | 'invalid' {
  if (poolIndex !== undefined && poolIndex !== null) {
    if (typeof poolIndex !== 'number') return 'invalid';
    return canImperialPickFromPool(G, G.dreamMasterID, poolIndex) ? poolIndex : 'invalid';
  }
  const inPool = inPoolBribeIndexes(G);
  if (inPool.length === 0) return null;
  return random.Shuffle(inPool)[0]!;
}

// --- 内部 helper：发动梦魇并清理 ---
// 梦魇效果生效后，该层梦魇离开棋盘、记为已发动并计入已用梦魇；效果非法时整体非法。
function activateNightmareOnLayer(
  G: SetupState,
  layer: number,
  random: BGIORandom,
  params?: Record<string, unknown>,
): SetupState | typeof INVALID_MOVE {
  const nid = G.layers[layer]?.nightmareId;
  if (!nid) return INVALID_MOVE;
  const next = applyNightmareEffect(G, layer, nid, random, params);
  if (next === INVALID_MOVE) return INVALID_MOVE;
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
}

/** 对比 before/after 的 vaults，返回本次刚打开的金币金库（若有） */
function findJustOpenedCoinVault(
  before: SetupState['vaults'],
  after: SetupState['vaults'],
): (typeof after)[number] | null {
  for (let i = 0; i < after.length; i++) {
    const a = after[i]!;
    const b = before[i];
    if (a.isOpened && b && !b.isOpened && a.contentType === 'coin') return a;
  }
  return null;
}

// --- 内部 helper：金库刚被打开的结算 ---
// 对比 before / after：本次刚打开的是金币金库、且打开者对外是盗梦者（含背叛者）时，
// 挂起 pendingVaultDecision，由梦主在 masterVaultDecision 里三选一，这里不派贿赂牌也不动梦魇。
// 打开者是梦主本人或没有打开者：什么都不发生，梦魇留在原处。
// 秘密金库由 endIf 判盗梦者胜，不在这里处理。解封与技能把心锁减到 0 翻开金库都走这里。
// 对照：docs/manual/03-game-flow.md:33-36、94-103
function settleVaultOpened(before: SetupState, after: SetupState): SetupState {
  const coinVault = findJustOpenedCoinVault(before.vaults, after.vaults);
  const openerID = coinVault?.openedBy;
  if (!coinVault || !openerID || !isOutwardThief(after, openerID)) return after;
  // 贿赂池已空、该层也没有梦魇牌：梦主没有可选的东西，不挂起
  const canDeal = after.bribePool.some((b) => b.status === 'inPool');
  if (!canDeal && !after.layers[coinVault.layer]?.nightmareId) return after;
  return { ...after, pendingVaultDecision: { layer: coinVault.layer, openerID } };
}

// --- 内部 helper：解封成功完整副作用链 ---
// 由 passResponse（全员 pass）与 resolveUnlock（兜底）共享。
// 顺序：applyUnlockSuccess → 金币金库挂起梦主三选一 → 译梦师抽 2 → 梦境猎手·满载 → 空间女王·监察。
// 对照：docs/manual/04-action-cards.md 解封 + docs/manual/08-appendix.md M4-4
function resolveUnlockFull(G: SetupState): SetupState {
  if (!G.pendingUnlock) return G;
  const unlockerId = G.pendingUnlock.playerID;
  let s = applyUnlockSuccess(G);
  s = settleVaultOpened(G, s);
  s = applyInterpreterForeshadow(s, unlockerId);
  s = applyExtractorBounty(s, unlockerId);
  s = settleSpaceQueenObserve(s);
  return s;
}

// --- BGIO Game 定义 ---
const NICKNAME_MAX_LENGTH = 50;

/** 建局参数里的座位昵称：不给返回 null；给了就必须逐项合法 */
function parseNicknames(raw: unknown, numPlayers: number): string[] | null {
  if (raw === undefined) return null;
  if (
    !Array.isArray(raw) ||
    raw.length !== numPlayers ||
    raw.some((n) => typeof n !== 'string' || n.length < 1 || n.length > NICKNAME_MAX_LENGTH)
  ) {
    throw new Error(
      `setupData.nicknames 必须是长度为 ${numPlayers}、每项 1-${NICKNAME_MAX_LENGTH} 个字符的字符串数组`,
    );
  }
  return raw as string[];
}

/** 建局参数里的 Bot 座位：不给返回空数组；给了就必须是范围内不重复的座位号 */
function parseBotSeats(raw: unknown, numPlayers: number): string[] {
  if (raw === undefined) return [];
  const valid = new Set(Array.from({ length: numPlayers }, (_, i) => String(i)));
  if (
    !Array.isArray(raw) ||
    raw.some((s) => typeof s !== 'string' || !valid.has(s)) ||
    new Set(raw).size !== raw.length
  ) {
    throw new Error(`setupData.botSeats 必须是 '0'..'${numPlayers - 1}' 之内不重复的座位号数组`);
  }
  return raw as string[];
}

export const InceptionCityGame = {
  name: 'inception-city',
  minPlayers: MATCH_MIN_PLAYERS,
  maxPlayers: MATCH_MAX_PLAYERS,
  disableUndo: true,

  setup: ({ ctx }: { ctx: { numPlayers: number } }, setupData?: Record<string, unknown>) => {
    const data = setupData ?? {};
    // 种子决定金库、贿赂、梦魇与牌库顺序，不能有默认值：漏传会让每局布局完全相同
    if (typeof data.rngSeed !== 'string' || data.rngSeed.length === 0) {
      throw new Error('建局必须提供非空的 rngSeed（setupData.rngSeed）');
    }
    const numPlayers = ctx.numPlayers;
    const playerIds = Array.from({ length: numPlayers }, (_, i) => String(i));
    const nicknames =
      parseNicknames(data.nicknames, numPlayers) ?? playerIds.map((_, i) => `Player ${i + 1}`);
    const botSeats = parseBotSeats(data.botSeats, numPlayers);

    return createInitialState({
      playerCount: numPlayers,
      playerIds,
      nicknames,
      botSeats,
      rngSeed: data.rngSeed,
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

            // 给玩家随机分配角色：候选池见 characterPools.ts
            const masterChar = MASTER_POOL[random.Die(MASTER_POOL.length) - 1]!;
            const shuffledThieves = random.Shuffle([...THIEF_POOL]);

            const nextPlayers: typeof G.players = { ...G.players };
            let thiefCursor = 0;
            for (const pid of G.playerOrder) {
              if (pid === masterID) {
                nextPlayers[pid] = {
                  ...nextPlayers[pid]!,
                  faction: 'master' as Faction,
                  characterId: masterChar,
                  // 梦主的世界观效果对所有玩家公开可见（世界观全局触发规则），
                  // 因此梦主 characterId 对所有玩家公开；盗梦者继续保持 isRevealed=false
                  // 直到被翻面或贿赂揭示。
                  // 对照：docs/manual/06-dream-master.md 各梦主"世界观"条目
                  isRevealed: true,
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

            // 水星·航路世界观：梦主翻开时 bribePool 追加 1 张 fail
            // 对照：docs/manual/06-dream-master.md 水星·航路
            const baseState: SetupState = {
              ...G,
              phase: 'playing' as const,
              dreamMasterID: masterID,
              players: nextPlayers,
            };
            return applyMercuryRouteExtraFailBribe(baseState, masterChar);
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
          // 梦主 M4-3：若梦主回合开始时处于迷失层（layer 0），自动复活
          //   —— 规则：梦主无需弃手牌，落在进入迷失层之前所在的那一层
          //   —— 对照：docs/manual/03-game-flow.md 复活；docs/manual/08-appendix.md M4 梦主优势第 3 条
          //   记录缺失（旧状态）时回落第 1 层
          if (ctx.currentPlayer === s.dreamMasterID) {
            const master = s.players[s.dreamMasterID];
            if (master && (master.currentLayer === 0 || !master.isAlive)) {
              const returnLayer = (master.layerBeforeLimbo ?? 1) as Layer;
              s = {
                ...s,
                players: {
                  ...s.players,
                  [s.dreamMasterID]: {
                    ...master,
                    isAlive: true,
                    deathTurn: null,
                    layerBeforeLimbo: null,
                  },
                },
              };
              s = movePlayerToLayer(s, s.dreamMasterID, returnLayer);
            }
          }
          return s;
        },
        // 回合末：还原移形换影快照（对照 docs/manual/04-action-cards.md 移形换影 解析）
        // + 检查筑梦师·迷宫是否到期（mazeState.untilTurnNumber 已被超过）
        onEnd: ({ G, ctx }: { G: SetupState; ctx: BGIOCtx }) => {
          let s = shiftGuardAndRestore(G);
          if (s.mazeState && G.turnNumber >= s.mazeState.untilTurnNumber) {
            s = { ...s, mazeState: null };
          }
          // 白羊·星尘：回合末未消费的 pending 强制清空，防卡死
          if (s.pendingAriesChoice) {
            s = { ...s, pendingAriesChoice: null };
          }
          // 处女·完美：回合末未决定强制清空（视为放弃技能，防卡死）
          if (s.pendingVirgoChoice) {
            s = { ...s, pendingVirgoChoice: null };
          }
          // 双鱼·闪避：回合末未决定强制清空（视为放弃响应，防卡死）
          //   注：理想情况是回合末不应有该 pending（应在打 SHOOT 当下消费完）；保险兜底
          if (s.pendingShootResponse) {
            s = { ...s, pendingShootResponse: null };
          }
          // 冥王星地狱世界观：抽牌阶段结束时手牌≥6 打下的标记，在该盗梦者回合结束时兑现 → 入迷失层
          // 对照：docs/manual/06-dream-master.md 冥王星·地狱
          s = applyPlutoHellLostCheck(s, ctx.currentPlayer);
          return s;
        },
      },
      // 所有 move 扁平化（不用 BGIO stages）；统一套上待结算闸门
      moves: withSettleGate({
        // --- 抽牌阶段 ---
        doDraw: {
          move: ({ G, ctx, random }: MoveCtx) => {
            if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
            // 抽牌前后对比推出 drawnCards（用于先锋技能触发）
            const beforeHand = G.players[G.currentPlayerID]?.hand ?? [];
            // 冥王星地狱世界观：盗梦者抽牌数 = 1 颗骰子结果
            // 对照：cards-data.json dm_pluto_hell 世界观
            const isThief = isOutwardThief(G, G.currentPlayerID);
            // 盛夏·充盈是梦主本人的技能：背叛者虽属梦主阵营，没有梦主的技能
            const isMaster = G.currentPlayerID === G.dreamMasterID;
            const plutoOverride = isPlutoHellWorldActive(G) && isThief ? random.D6() : null;
            // 盛夏·充盈：梦主多抽 = 未派发贿赂数
            // 盛夏·世界观：盗梦者多抽 +1
            // 对照：docs/manual/06-dream-master.md 盛夏
            const midsummerMasterBonus = isMaster ? getMidsummerExtraDraws(G) : 0;
            const midsummerThiefBonus = isThief ? getMidsummerWorldThiefBonus(G) : 0;
            // 巨蟹·气场：与活着的巨蟹同层（含自己）→ 抽牌 +1（迷失层不触发）
            // 对照：docs/manual/05-dream-thieves.md 巨蟹
            const cancerAuraBonus = getCancerAuraBonus(G, G.currentPlayerID);
            const totalDraw =
              (plutoOverride ?? BASE_DRAW_COUNT) +
              midsummerMasterBonus +
              midsummerThiefBonus +
              cancerAuraBonus;
            let s = drawCards(G, G.currentPlayerID, totalDraw);
            const afterHand = s.players[G.currentPlayerID]?.hand ?? [];
            const drawn = afterHand.slice(beforeHand.length);
            // 先锋技能：抽到 action_dream_transit 则额外抽 2 张
            s = applyPointmanAssault(s, G.currentPlayerID, drawn);
            // 狮子王道：抽完后从牌库顶额外抽 = 梦主手牌数
            s = applyLeoKingdom(s, G.currentPlayerID);
            // 白羊·弃梦魇加成：抽牌阶段额外抽牌
            s = settleAriesExtraDraw(s);
            s = endDrawPhase(s);
            return s;
          },
          client: false,
        },
        skipDraw: {
          move: ({ G, ctx }: MoveCtx) => {
            if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
            return endDrawPhase(G);
          },
          client: false,
        },

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

        // 黑洞·吞噬（抽牌阶段替代 doDraw：同层每个玩家给 1 张手牌）
        // 对照：docs/manual/05-dream-thieves.md 黑洞
        playBlackHoleLevy: {
          move: ({ G, ctx }: MoveCtx, giverPicks: Record<string, CardID>) => {
            if (!isRecordOf(giverPicks, isString)) return INVALID_MOVE;
            if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
            const applied = applyBlackHoleLevy(G, G.currentPlayerID, giverPicks);
            if (applied === null) return INVALID_MOVE;
            return endDrawPhase(applied);
          },
          client: false,
        },

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

        // 皇城世界观：收到贿赂的玩家选一个未收到贿赂的盗梦者视为 SHOOT（掷骰-3）
        // 每收到 1 张贿赂牌获得 1 次机会（imperialShootCharges），发动即消耗
        // 对照：docs/manual/06-dream-master.md 皇城
        useImperialCityWorldShoot: {
          move: ({ G, ctx, random }: MoveCtx, targetID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const master = G.players[G.dreamMasterID];
            if (!master || master.characterId !== 'dm_imperial_city') return INVALID_MOVE;
            const roll = random.D6();
            const applied = applyImperialCityWorldShoot(G, ctx.currentPlayer, targetID, roll, () =>
              random.D6(),
            );
            if (applied === null) return INVALID_MOVE;
            return incrementMoveCounter(applied);
          },
          client: false,
        },

        // 复活：出牌阶段弃 2 张手牌复活自己或他人（密道世界观：弃 1 张穿梭剂）
        // 对照：docs/manual/03-game-flow.md 复活 / docs/manual/06-dream-master.md 密道
        playRevive: {
          move: ({ G, ctx }: MoveCtx, targetID: string | null, discardedCardIds: CardID[]) => {
            if (!isStringArray(discardedCardIds)) return INVALID_MOVE;
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const applied = applyRevive(G, ctx.currentPlayer, targetID, discardedCardIds);
            if (applied === null) return INVALID_MOVE;
            return incrementMoveCounter(applied);
          },
          client: false,
        },

        // 金星·镜界世界观：弃 2 张牌复制本回合已用的 SHOOT/KICK 效果
        // 对照：docs/manual/06-dream-master.md 金星·镜界
        useVenusMirrorWorld: {
          move: ({ G, ctx, random }: MoveCtx, targetID: string, discardedCardIds: CardID[]) => {
            if (!isStringArray(discardedCardIds)) return INVALID_MOVE;
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const roll = random.D6();
            const applied = applyVenusMirrorWorld(
              G,
              ctx.currentPlayer,
              targetID,
              discardedCardIds,
              roll,
            );
            if (applied === null) return INVALID_MOVE;
            return incrementMoveCounter(applied);
          },
          client: false,
        },

        // --- 行动阶段 ---
        endActionPhase: {
          move: ({ G, ctx }: MoveCtx) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
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
            if (!target || !target.isAlive || targetPlayerID === ctx.currentPlayer)
              return INVALID_MOVE;
            // 与普通路径同一套层数限制：只有刺客之王不要求同层（意念判官不具备摩羯 / 恐怖分子的豁免）
            if (violatesShootLayerLimit(G, self, target, cardId !== 'action_shoot_assassin'))
              return INVALID_MOVE;

            // 死亡宣言校验
            const decreeCheck = validateDecree(G, ctx.currentPlayer, decreeId);
            if (decreeCheck === 'INVALID') return INVALID_MOVE;

            // 根据卡牌类型确定 deathFaces/moveFaces/extraOnMove
            const optsMap: Record<
              string,
              {
                deathFaces: number[];
                moveFaces: number[];
                extraOnMove: 'discard_unlocks' | 'discard_shoots' | null;
              }
            > = {
              action_shoot: { deathFaces: [1], moveFaces: [2, 3, 4], extraOnMove: null },
              action_shoot_dream_transit: {
                deathFaces: [1],
                moveFaces: [2, 3, 4],
                extraOnMove: null,
              },
              action_shoot_assassin: {
                deathFaces: [1, 2],
                moveFaces: [3, 4, 5],
                extraOnMove: null,
              },
              action_shoot_drill: {
                deathFaces: [1, 2],
                moveFaces: [3, 4, 5],
                extraOnMove: 'discard_unlocks',
              },
              action_shoot_burst: {
                deathFaces: [1, 2],
                moveFaces: [3, 4, 5],
                extraOnMove: 'discard_shoots',
              },
            };
            const opts = optsMap[cardId];
            if (!opts) return INVALID_MOVE;
            const deathFaces =
              decreeCheck !== null ? [...opts.deathFaces, decreeCheck] : opts.deathFaces;

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
            if (!target || !target.isAlive || targetPlayerID === ctx.currentPlayer)
              return INVALID_MOVE;
            if (targetLayer < 1 || targetLayer > 4) return INVALID_MOVE;

            // 1) 弃穿梭剂（SHOOT 牌留给 applyShootVariant 弃）
            let s = discardCard(G, ctx.currentPlayer, transitCard);
            // 2) 移到目标层
            s = movePlayerToLayer(s, ctx.currentPlayer, targetLayer as Layer);
            // 3) 根据卡牌类型映射 SHOOT opts → 复用 applyShootVariant
            const optsMap: Record<string, ShootVariantOpts> = {
              action_shoot: {
                sameLayerRequired: true,
                deathFaces: [1],
                moveFaces: [2, 3, 4],
                extraOnMove: null,
              },
              action_shoot_dream_transit: {
                sameLayerRequired: true,
                deathFaces: [1],
                moveFaces: [2, 3, 4],
                extraOnMove: null,
              },
              action_shoot_assassin: {
                sameLayerRequired: false,
                deathFaces: [1, 2],
                moveFaces: [3, 4, 5],
                extraOnMove: null,
              },
              action_shoot_drill: {
                sameLayerRequired: true,
                deathFaces: [1, 2],
                moveFaces: [3, 4, 5],
                extraOnMove: 'discard_unlocks',
              },
              action_shoot_burst: {
                sameLayerRequired: true,
                deathFaces: [1, 2],
                moveFaces: [3, 4, 5],
                extraOnMove: 'discard_shoots',
              },
            };
            const opts = optsMap[shootCardId];
            if (!opts) return INVALID_MOVE;
            const r = applyShootVariant(s, ctx, random, targetPlayerID, shootCardId, opts);
            return r === INVALID_MOVE ? r : recordCardPlayed(r, shootCardId);
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
        // 打出解封 - 盗梦者解锁同层心锁（效果①）
        // 对照：docs/manual/04-action-cards.md 解封
        // playUnlock 成功后即刻打开响应窗口（对照：§解封 使用时机②
        //   "任意玩家使用【解封】的效果①时"），允许其他玩家出效果②抵消
        playUnlock: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (!isCardForPlayMove('playUnlock', cardId)) return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            if (!player || !player.isAlive) return INVALID_MOVE;
            // 梦主不能使用效果①；背叛者对外是盗梦者，可以使用
            if (isDreamMaster(G, ctx.currentPlayer)) return INVALID_MOVE;
            if (!player.hand.includes(cardId)) return INVALID_MOVE;
            // 自己复活自己的当回合不能用效果①（效果②走 respondCancelUnlock，不受限）
            // 对照：docs/manual/04-action-cards.md 解封 效果①
            if ((player.skillUsedThisTurn[REVIVED_SELF_THIS_TURN_KEY] ?? 0) > 0)
              return INVALID_MOVE;
            // 摩羯·节奏 / 水瓶·同流：被动豁免解封次数限制
            // 黑洞·DM 世界观：上限提升至 2
            // 技能减少心锁也占用同一份次数（R-23）
            if (!canMakeSuccessfulUnlock(G, player)) return INVALID_MOVE;

            const currentLayer = player.currentLayer;
            const layerState = G.layers[currentLayer];
            if (!layerState || layerState.heartLockValue <= 0) return INVALID_MOVE;

            let s = discardCard(G, ctx.currentPlayer, cardId);
            s = {
              ...s,
              pendingUnlock: {
                playerID: ctx.currentPlayer,
                layer: currentLayer,
                cardId,
              },
            };
            // 打开响应窗口：responders = 其他存活玩家（含梦主）
            const responders = s.playerOrder.filter((id) => {
              const p = s.players[id];
              return !!p && p.isAlive && id !== ctx.currentPlayer;
            });
            if (responders.length > 0) {
              s = openResponseWindow(s, {
                sourceAbilityID: 'action_unlock_effect_1',
                sourceType: 'unlock',
                responders,
                timeoutMs: 30_000,
                validResponseAbilityIDs: ['action_unlock_effect_2'],
                onTimeout: 'resolve',
              });
              return recordCardPlayed(s, cardId);
            }
            // 没有可响应者：不开窗口，先记录出牌再直接结算，避免 pendingUnlock 悬空卡住对局
            return resolveUnlockFull(recordCardPlayed(s, cardId));
          },
          client: false,
        },
        // resolveUnlock：兜底入口 - 在响应窗口未接入或 bot 直接推进时可用。
        // 正常流程下由 passResponse 在"全员 pass"时自动触发 resolveUnlockFull。
        //   该 move 仍保留：供 bot/无响应窗口场景 fallback；会强制关闭可能残留的窗口。
        resolveUnlock: {
          move: ({ G }: MoveCtx) => {
            if (!G.pendingUnlock) return INVALID_MOVE;
            // 强制退栈：若仍挂着响应窗口（兜底路径），回退到父窗口或 null
            let s: SetupState = G.pendingResponseWindow
              ? { ...G, pendingResponseWindow: G.pendingResponseWindow.parentWindow ?? null }
              : G;
            s = resolveUnlockFull(s);
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

        // 响应解封效果②：抵消一张正在结算的【解封】。
        // 对照：docs/manual/04-action-cards.md §解封 效果②
        // 补齐 responder 校验 + 持卡校验 + 弃牌 + 关闭响应窗口。
        //   无参数：响应者就是发起者（包装层已按行动权表校验并把 ctx.currentPlayer 设为发起者）。
        respondCancelUnlock: {
          move: ({ G, ctx }: MoveCtx) => {
            const rid = ctx.currentPlayer;
            if (!G.pendingUnlock) return INVALID_MOVE;
            const w = G.pendingResponseWindow;
            if (!w) return INVALID_MOVE;
            if (w.sourceAbilityID !== 'action_unlock_effect_1') return INVALID_MOVE;
            if (!w.responders.includes(rid)) return INVALID_MOVE;
            if (w.responded.includes(rid)) return INVALID_MOVE;
            const responder = G.players[rid];
            if (!responder || !responder.isAlive) return INVALID_MOVE;
            const unlockCard = 'action_unlock' as CardID;
            if (!responder.hand.includes(unlockCard)) return INVALID_MOVE;
            // 弃响应者 1 张【解封】
            let s = discardCard(G, rid, unlockCard);
            // 关闭响应窗口（栈式回退到 parentWindow / null）
            const close = respondToWindow(s, rid, 'action_unlock_effect_2');
            s = close.state;
            // 撤销解封：pendingUnlock → null（不减心锁，不加 successfulUnlocksThisTurn）
            s = applyUnlockCancel(s);
            return s;
          },
          client: false,
        },
        // pass 响应：表示自己不出效果②抵消。
        // 校验 responder 合法 & 未重复 pass；全员 pass 时自动进入 resolveUnlockFull。
        //   无参数：响应者就是发起者（同 respondCancelUnlock）。
        passResponse: {
          move: ({ G, ctx }: MoveCtx) => {
            const rid = ctx.currentPlayer;
            const w = G.pendingResponseWindow;
            if (!w) return INVALID_MOVE;
            if (!w.responders.includes(rid)) return INVALID_MOVE;
            if (w.responded.includes(rid)) return INVALID_MOVE;
            // 本次 pass 后是否所有 responder 都已响应
            const isLastPass = w.responded.length + 1 >= w.responders.length;
            let s = passOnResponse(G, rid);
            // 全员 pass 且源是解封效果① → 自动结算为"解封成功"（含译梦师/M4-4 等副作用）
            if (isLastPass && w.sourceAbilityID === 'action_unlock_effect_1' && s.pendingUnlock) {
              s = resolveUnlockFull(s);
            }
            return s;
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
            return recordCardPlayed(incrementMoveCounter(s), cardId);
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
            return recordCardPlayed(incrementMoveCounter(kicked), cardId);
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

        // 贿赂牌只在金币金库打开（masterVaultDecision）与【梦境窥视】效果①（masterPeekBribeDecision）
        // 时派发，梦主不能在自己回合随意派。
        // 对照：docs/manual/03-game-flow.md 贿赂&背叛者（38-45 行）

        // 密道·传送：弃 1 穿梭剂送任一盗梦者到迷失层。回合限 2 次。
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

        // 天王星·权力：每未派发贿赂可移动 1 个盗梦者到指定层（非迷失层）
        // 对照：cards-data.json dm_uranus_firmament
        // 金星·镜界 · 重影：展示牌库顶 N（N=活盗梦者数）+ 展示手牌 → 同名入手，其余混洗回顶
        // 对照：docs/manual/06-dream-master.md 金星·镜界
        useVenusDouble: {
          move: ({ G, ctx, random }: MoveCtx, revealedHandIds: CardID[]) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            if (!Array.isArray(revealedHandIds)) return INVALID_MOVE;
            const result = applyVenusDouble(
              G,
              ctx.currentPlayer,
              revealedHandIds,
              <T>(arr: readonly T[]) => random.Shuffle([...arr]),
            );
            if (result === null) return INVALID_MOVE;
            return result;
          },
          client: false,
        },

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

        // 冥王星·业火：弃 1 → 所有手牌<2 的盗梦者抽 2
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

        // 火星·杀戮：弃 1 解封 → 发动指定层的梦魇牌效果（无需翻开）
        // 对照：cards-data.json dm_mars_battlefield
        useMarsKill: {
          move: ({ G, ctx, random }: MoveCtx, layer: number, params?: Record<string, unknown>) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            if (!canMarsKill(G, ctx.currentPlayer)) return INVALID_MOVE;
            const ls = G.layers[layer];
            if (!ls || !ls.nightmareId) return INVALID_MOVE;
            // 弃 1 解封
            const afterDiscard = applyMarsKillDiscardUnlock(G, ctx.currentPlayer);
            if (afterDiscard === null) return INVALID_MOVE;
            // 发动梦魇效果；该层梦魇离开棋盘并计入已发动
            const next = activateNightmareOnLayer(afterDiscard, layer, random, params);
            if (next === INVALID_MOVE) return INVALID_MOVE;
            return incrementMoveCounter(next);
          },
          client: false,
        },

        // 土星·领地世界观：持贿赂的盗梦者出牌阶段免费移动 1 次到相邻层
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
        // 射手·穿心：本回合击杀过玩家时，修改任意一层心锁 ±1（回合限 1 次）
        // 对照：docs/manual/05-dream-thieves.md 射手
        useSagittariusHeartLock: {
          move: ({ G, ctx }: MoveCtx, layer: number, delta: -1 | 1) => {
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
            const settled = settleVaultOpened(G, result);
            return markSkillUsed(settled, ctx.currentPlayer, SAGITTARIUS_HEART_LOCK_SKILL_ID);
          },
          client: false,
        },

        // 火星·战场世界观：弃 2 非 SHOOT → 弃牌堆取 1 SHOOT 入手
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
            if (!Number.isInteger(vaultIdx1) || !Number.isInteger(vaultIdx2)) return INVALID_MOVE;
            if (!G.vaults[vaultIdx1] || !G.vaults[vaultIdx2]) return INVALID_MOVE;
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

        // 双子·协同：弃牌阶段，梦主在更大层时掷骰 → 3 → 当层 -2 心锁 → 翻面
        // 对照：docs/manual/05-dream-thieves.md 双子
        playGeminiSync: {
          move: ({ G, ctx, random }: MoveCtx) => {
            if (ctx.currentPlayer !== G.currentPlayerID) return INVALID_MOVE;
            if (G.turnPhase !== 'discard') return INVALID_MOVE;
            const roll = random.D6();
            const next = applyGeminiSync(G, ctx.currentPlayer, roll);
            if (next === null) return INVALID_MOVE;
            return settleVaultOpened(G, next);
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
            const shooterCtx: BGIOCtx = { ...ctx, currentPlayer: pending.shooterID };
            const result = applyShootVariant(
              cleared,
              shooterCtx,
              random,
              pending.targetPlayerID,
              pending.cardId,
              {
                sameLayerRequired: pending.sameLayerRequired,
                deathFaces: pending.deathFaces,
                moveFaces: pending.moveFaces,
                extraOnMove: pending.extraOnMove,
                decreeId: pending.decreeId,
                preventMove: pending.preventMove,
                skipPiscesCheck: true,
              },
            );
            if (result === INVALID_MOVE) return INVALID_MOVE;
            return result;
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
            const shooterCtx: BGIOCtx = { ...ctx, currentPlayer: pending.shooterID };
            const result = applyShootVariant(
              s,
              shooterCtx,
              random,
              pending.targetPlayerID,
              pending.cardId,
              {
                sameLayerRequired: pending.sameLayerRequired,
                deathFaces: pending.deathFaces,
                moveFaces: pending.moveFaces,
                extraOnMove: pending.extraOnMove,
                decreeId: pending.decreeId,
                preventMove: pending.preventMove,
                skipPiscesCheck: true,
                skipTerroristCheck: true,
                terroristPenalty: false,
              },
            );
            if (result === INVALID_MOVE) return INVALID_MOVE;
            return result;
          },
          client: false,
        },

        // 雅典娜·急智（skill_0）· 主动 move（回合外可发起）
        // 对照：docs/manual/05-dream-thieves.md 雅典娜
        // 规则："当其他盗梦者对你使用行动牌时，你可以先从弃牌堆顶部摸 1 张牌"
        // 实装策略：
        //   - 主动 move（不强制响应窗口模式），雅典娜玩家在他人回合任意时机可发起
        //   - perTurn 限制：每回合最多 1 次（natural 通过 skillUsedThisTurn 实现，
        //     turn.onBegin 重置 → 自然实现"每个对手回合限 1 次"）
        //   - UI 层在检测到"他人对己出行动牌"时高亮提示，引导玩家点击使用
        // 守卫：
        //   - 雅典娜本人 + 存活 + 角色匹配（applyAthenaWit 内部校验）
        //   - 弃牌堆非空（同上内部校验）
        //   - perTurn 限制：未超 1 次（markSkillUsed 限制）
        //   - 不要求 turnPhase（回合外可发起）
        useAthenaWit: {
          move: ({ G, ctx }: MoveCtx) => {
            if (G.phase !== 'playing') return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            if (!player || !player.isAlive) return INVALID_MOVE;
            if (player.characterId !== 'thief_athena') return INVALID_MOVE;
            // 每回合限 1 次（自然实现"每个对手回合限 1 次"，因 skillUsedThisTurn 在 turn.onBegin 重置）
            if ((player.skillUsedThisTurn[ATHENA_WIT_SKILL_ID] ?? 0) >= 1) {
              return INVALID_MOVE;
            }
            // 自己回合不允许（"其他玩家对你使用行动牌时"语义）
            if (ctx.currentPlayer === G.currentPlayerID) return INVALID_MOVE;

            const next = applyAthenaWit(G, ctx.currentPlayer);
            if (next === null) return INVALID_MOVE;
            const counted = markSkillUsed(next, ctx.currentPlayer, ATHENA_WIT_SKILL_ID);
            return incrementMoveCounter(counted);
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
            const shooterCtx: BGIOCtx = { ...ctx, currentPlayer: pending.shooterID };
            const result = applyShootVariant(
              cleared,
              shooterCtx,
              random,
              pending.targetPlayerID,
              pending.cardId,
              {
                sameLayerRequired: pending.sameLayerRequired,
                deathFaces: pending.deathFaces,
                moveFaces: pending.moveFaces,
                extraOnMove: pending.extraOnMove,
                decreeId: pending.decreeId,
                preventMove: pending.preventMove,
                skipPiscesCheck: true,
                skipTerroristCheck: true,
                terroristPenalty: true,
              },
            );
            if (result === INVALID_MOVE) return INVALID_MOVE;
            return result;
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

        // 达尔文·进化：抽牌库顶 2 + 还 2 任意顺序到顶（限 1 次/回合）
        // 对照：docs/manual/05-dream-thieves.md 达尔文
        playDarwinEvolution: {
          move: ({ G, ctx }: MoveCtx, returnCards: CardID[]) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
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
            const next = applyShadeFollow(G, ctx.currentPlayer);
            if (next === null) return INVALID_MOVE;
            return incrementMoveCounter(next);
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
            return setTurnPhase(settleVaultOpened(G, r.state), 'discard');
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

        // 战争之王·黑市：弃 2 手牌 → 弃牌堆任 1 张入手
        // 对照：docs/manual/05-dream-thieves.md 战争之王
        playLordOfWarBlackMarket: {
          move: ({ G, ctx }: MoveCtx, discardIds: CardID[], pickFromDiscard: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
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
            const next = applyTouristAssist(G, ctx.currentPlayer, targetPlayerID);
            if (next === null) return INVALID_MOVE;
            return next;
          },
          client: false,
        },

        // --- 弃牌阶段 ---
        doDiscard: {
          move: ({ G, ctx, events }: MoveCtx, cardIds: CardID[]) => {
            if (!isStringArray(cardIds)) return INVALID_MOVE;
            if (!guardTurnPhase(G, ctx, 'discard')) return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            // 小丑·失控罚则：发动失控的当回合弃牌阶段必须弃光手牌（armedAtTurn === turnNumber）
            // 对照：docs/manual/05-dream-thieves.md 小丑「则你在弃牌阶段必须弃掉所有手牌」
            const forced =
              player &&
              typeof player.forcedDiscardArmedAtTurn === 'number' &&
              player.forcedDiscardArmedAtTurn === G.turnNumber;
            if (forced) {
              // 必须一次性弃掉全部手牌，否则拒绝
              if (cardIds.length !== player!.hand.length) return INVALID_MOVE;
            }
            // 每张要弃的牌都必须在手里（同一张写两次要求手里有两张）
            if (!player) return INVALID_MOVE;
            const remainingHand = [...player.hand];
            for (const c of cardIds) {
              const idx = remainingHand.indexOf(c);
              if (idx === -1) return INVALID_MOVE;
              remainingHand.splice(idx, 1);
            }
            // 弃完后须不超手牌上限；巨蟹·庇佑生效时不限（与 skipDiscard 一致）
            if (remainingHand.length > HAND_LIMIT && !isCancerShelterActive(G, ctx.currentPlayer)) {
              return INVALID_MOVE;
            }
            let next = discardToLimit(G, ctx.currentPlayer, cardIds);
            if (forced) {
              next = {
                ...next,
                players: {
                  ...next.players,
                  [ctx.currentPlayer]: {
                    ...next.players[ctx.currentPlayer]!,
                    forcedDiscardArmedAtTurn: null,
                  },
                },
              };
            }
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
            // 巨蟹·庇佑：与活着的巨蟹同层 → 无手牌上限（不拦截小丑罚则）
            // 对照：docs/manual/05-dream-thieves.md 巨蟹「庇佑」
            const player = G.players[ctx.currentPlayer];
            const sheltered = isCancerShelterActive(G, ctx.currentPlayer);
            if (player && player.hand.length > HAND_LIMIT && !sheltered) return INVALID_MOVE;
            // 小丑·失控罚则：当回合发动过且手牌 > 0 → 不得跳过（必须走 doDiscard 全弃）
            const armed =
              !!player &&
              typeof player.forcedDiscardArmedAtTurn === 'number' &&
              player.forcedDiscardArmedAtTurn === G.turnNumber;
            if (armed && player!.hand.length > 0) return INVALID_MOVE;
            events.endTurn();
            if (!armed) return G;
            return {
              ...G,
              players: {
                ...G.players,
                [ctx.currentPlayer]: { ...player!, forcedDiscardArmedAtTurn: null },
              },
            };
          },
          client: false,
        },
        // 空间女王·造物：弃牌阶段放 1 手牌到牌库顶
        // 对照：docs/manual/05-dream-thieves.md 空间女王
        useSpaceQueenStashTop: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
            if (G.turnPhase !== 'discard') return INVALID_MOVE;
            if (ctx.currentPlayer !== G.currentPlayerID) return INVALID_MOVE;
            const result = applySpaceQueenStashTop(G, ctx.currentPlayer, cardId);
            if (result === null) return INVALID_MOVE;
            return result;
          },
          client: false,
        },
      }),
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

    // 盗梦者全部在迷失层不是终局：迷失层的玩家仍可在自己回合的出牌阶段弃 2 张牌复活自己
    // 对照：docs/manual/03-game-flow.md 第 19–20 行（胜负只有「打开秘密金库」与「牌库抽完」两条）

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

  // 行动权：对局阶段按行动权表放行（回合外的响应者、被选中的目标也能行动）；
  // 其他阶段只有回合主人。对局阶段 move 本体里的 ctx.currentPlayer 由包装层改写为发起者
  actionRights({ G, ctx, playerID, move }) {
    if (ctx.phase === 'playing') return denyAction(G, playerID, move) === null;
    return playerID === ctx.currentPlayer;
  },

  // 视图：服务端发给每个观察者的对局状态，经白名单裁剪；视图只经运行器的 viewMatch 取得
  view({ G, ctx, viewer }) {
    return viewFor(G, viewer, {
      gameOver: ctx.gameover !== undefined,
      outcome: matchOutcome(ctx.gameover, G),
    });
  },

  // 事件描述：对比一步前后的状态，推导这一步产生的领域事件
  describe: describeMatchEvents,

  // 恢复快照时把旧版本的对局状态迁移到当前版本
  migrate: (G) => migrateGameState(G as Record<string, unknown>),

  // 恢复快照后检查对局状态的基本形状（只查行动权判定和流程依赖的字段，规则不变量由 invariants 负责）
  validate(G) {
    const order: unknown = G.playerOrder;
    if (!Array.isArray(order) || order.length === 0 || order.some((id) => typeof id !== 'string')) {
      return 'G.playerOrder 必须是非空的字符串数组';
    }
    const players: unknown = G.players;
    if (typeof players !== 'object' || players === null || Array.isArray(players)) {
      return 'G.players 必须是对象';
    }
    for (const id of order as string[]) {
      if (!Object.hasOwn(players, id)) return `G.playerOrder 里的 ${id} 不在 G.players 中`;
    }
    if (typeof G.currentPlayerID !== 'string') return 'G.currentPlayerID 必须是字符串';
    if (typeof G.dreamMasterID !== 'string') return 'G.dreamMasterID 必须是字符串';
    if (typeof G.layers !== 'object' || G.layers === null) return '缺少 G.layers';
    if (!Array.isArray(G.vaults)) return '缺少 G.vaults';
    return null;
  },
} satisfies GameDef<SetupState>;

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
      return p && isOutwardThief(s, pid) && p.isAlive;
    });
    for (const pid of thieves) {
      const roll = random.D6();
      if (roll === 5 || roll === 6 || roll === layer) {
        s = sendToLimbo(s, pid);
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
      s = sendToLimbo(s, pid);
    }
    // 再处理其他层玩家
    for (const pid of G.playerOrder) {
      const p = s.players[pid];
      if (!p || !p.isAlive) continue;
      if (p.currentLayer === 0) continue;
      if (p.currentLayer === layer) continue;
      s = discardCards(s, pid, p.hand);
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
    return setLayerHeartLock(G, targetLayer, newValue);
  }

  if (nid === 'nightmare_plague') {
    // 梦主先派发贿赂给当层盗梦者（bribedTargets 指定，可以一张不发），派发完之后
    // 该层手里一张贿赂牌都没有的盗梦者进入迷失层；此前收到过贿赂牌的（含失败的）不受影响，
    // 不算被击杀。贿赂池已空时点名的人拿不到牌，只在他本来就没有贿赂牌时进迷失层。
    // 对照：docs/manual/07-nightmare-cards.md 邪念瘟疫（17-20 行）
    // params: { bribedTargets: string[] }
    const bribed = new Set((_params?.bribedTargets as string[]) ?? []);
    let s = G;
    const layerThieves = [...ls.playersInLayer].filter((pid) => {
      const p = s.players[pid];
      return p && isOutwardThief(s, pid) && p.isAlive;
    });
    for (const pid of layerThieves) {
      if (!bribed.has(pid)) continue;
      const poolIdxs = inPoolBribeIndexes(s);
      if (poolIdxs.length === 0) continue;
      const pickIdx = (random.Die(poolIdxs.length) - 1) % poolIdxs.length;
      const dealt = dealBribeCard(s, pid, poolIdxs[pickIdx]!);
      if (dealt !== null) s = dealt;
    }
    // 「手里有贿赂牌」：收到过贿赂牌即算（bribeReceived 公开、不会减少；池里 heldBy 是同一信息的另一面）
    for (const pid of layerThieves) {
      const holdsBribe =
        s.players[pid]!.bribeReceived > 0 || s.bribePool.some((b) => b.heldBy === pid);
      if (!holdsBribe) s = sendToLimbo(s, pid);
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
        s = discardCards(s, pid, p.hand.slice(0, 3));
      } else {
        // 不足 3 张 → 入迷失层（保留手牌，不视为被梦主击杀）
        s = sendToLimbo(s, pid);
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
  /** 射手·禁足：SHOOT 结果为 move 时阻止目标移动 */
  preventMove?: boolean;
  /**
   * 跳过 Pisces 闪避响应窗口检查。
   * - 默认 false：首次进入 applyShootVariant 时会检查 target 是否为可闪避双鱼
   * - true：respondShootPass move 重入时设置；防止响应窗口循环开启
   */
  skipPiscesCheck?: boolean;
  /**
   * 跳过 Terrorist 狂热响应窗口检查。
   * - true：respondTerroristDiscard/Accept move 重入时设置
   */
  skipTerroristCheck?: boolean;
  /**
   * 恐怖分子·狂热触发后未弃牌的惩罚：D6 后 baseRoll -1
   * 仅在 respondTerroristAccept 重入时设为 true
   */
  terroristPenalty?: boolean;
}

/** SHOOT 变体共享结算：kill/move/miss + 可选 on-move 弃牌副作用 + 死亡宣言
 *  对照：docs/manual/04-action-cards.md SHOOT 变体 + 死亡宣言
 */
/**
 * SHOOT 类牌的目标层数限制：要求同层的牌打向别的层时是否违规。
 * 摩羯·节奏：手牌数 >= 所在层数字时，SHOOT 类不受层数限制
 * 恐怖分子·远程：被动免除层数限制
 * 木星·巅峰世界观：SHOOT 类可对相邻层使用
 * 对照：docs/manual/04-action-cards.md SHOOT 使用目标
 */
function violatesShootLayerLimit(
  G: SetupState,
  shooter: PlayerSetup,
  target: PlayerSetup,
  sameLayerRequired: boolean,
): boolean {
  if (!sameLayerRequired || shooter.currentLayer === target.currentLayer) return false;
  const jupiterRelaxed =
    isJupiterPeakWorldActive(G) && isJupiterPeakLayerOK(shooter.currentLayer, target.currentLayer);
  return (
    !isCapricornusRhythmActive(shooter) && !isTerroristCrossLayerActive(shooter) && !jupiterRelaxed
  );
}

/**
 * 金牛·号角适用的牌：普通 SHOOT 与按 SHOOT 结算的 SHOOT·梦境穿梭剂（选「移动」时不会走到结算）。
 * 对照：docs/manual/05-dream-thieves.md 金牛 75 行「你使用【SHOOT】时」
 */
function isTaurusHornCard(cardId: CardID): boolean {
  return cardId === 'action_shoot' || cardId === 'action_shoot_dream_transit';
}

function applyShootVariant(
  G: SetupState,
  ctx: BGIOCtx,
  random: BGIORandom,
  targetPlayerID: string,
  cardId: CardID,
  rawOpts: ShootVariantOpts,
): SetupState | typeof INVALID_MOVE {
  // 客户端用 null 表示「没传」：统一成 undefined，免得 null 被写进待结算状态
  const opts: ShootVariantOpts = {
    ...rawOpts,
    decreeId: rawOpts.decreeId ?? undefined,
    preventMove: rawOpts.preventMove ?? undefined,
  };
  const shooter = G.players[ctx.currentPlayer];
  const target = G.players[targetPlayerID];
  if (!shooter || !target) return INVALID_MOVE;
  if (targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
  if (!target.isAlive) return INVALID_MOVE;
  if (!shooter.hand.includes(cardId)) return INVALID_MOVE;
  if (violatesShootLayerLimit(G, shooter, target, opts.sameLayerRequired)) return INVALID_MOVE;

  // 死亡宣言校验 + 附加死亡面
  const decreeCheck = validateDecree(G, ctx.currentPlayer, opts.decreeId);
  if (decreeCheck === 'INVALID') return INVALID_MOVE;
  const deathFaces = decreeCheck !== null ? [...opts.deathFaces, decreeCheck] : opts.deathFaces;

  // Pisces 闪避响应窗口（pre-roll）
  // skipPiscesCheck=true 由 respondShootPass move 重入时设置
  if (!opts.skipPiscesCheck && !G.pendingShootResponse && canPiscesEvade(target)) {
    return {
      ...G,
      pendingShootResponse: {
        shooterID: ctx.currentPlayer,
        targetPlayerID,
        cardId,
        sameLayerRequired: opts.sameLayerRequired,
        deathFaces: opts.deathFaces,
        moveFaces: opts.moveFaces,
        extraOnMove: opts.extraOnMove,
        decreeId: opts.decreeId,
        preventMove: opts.preventMove,
        responseType: 'pisces',
      },
    };
  }

  // Terrorist 狂热响应窗口（pre-roll，Pisces 之后）
  // 触发：shooter 是恐怖分子（被动技能 skill_1）→ target 必须弃 1 张否则骰 -1
  // 对照：docs/manual/05-dream-thieves.md 恐怖分子 狂热 247 行
  if (
    !opts.skipTerroristCheck &&
    !G.pendingShootResponse &&
    shooter.characterId === 'thief_terrorist' &&
    target.isAlive
  ) {
    return {
      ...G,
      pendingShootResponse: {
        shooterID: ctx.currentPlayer,
        targetPlayerID,
        cardId,
        sameLayerRequired: opts.sameLayerRequired,
        deathFaces: opts.deathFaces,
        moveFaces: opts.moveFaces,
        extraOnMove: opts.extraOnMove,
        decreeId: opts.decreeId,
        preventMove: opts.preventMove,
        responseType: 'terrorist',
      },
    };
  }

  const rawD6 = random.D6();
  // 恐怖分子·狂热惩罚：未弃牌时 baseRoll -1，点数修正最低为 1（与 M4、要塞、哈雷等修正一致）
  const baseRoll = opts.terroristPenalty ? Math.max(1, rawD6 - 1) : rawD6;
  // M4 卡宾枪全局化 —— 梦主使用 SHOOT 时目标骰 -1（基线梦主优势）
  // 对照：docs/manual/03-game-flow.md §80-81 M4 卡宾枪道具；§111 印证 M4 先于效果处理
  // 仅在"未被角色技能重写骰值"的通用路径生效，不影响灵雕师 override / 天蝎毒针等特殊处理
  //   （这些路径的 shooter 都是盗梦者，M4 本来就不触发）
  // M4 卡宾枪属于梦主本人，背叛者（梦主阵营的原盗梦者）没有
  const shooterIsMaster = ctx.currentPlayer === G.dreamMasterID;
  const postM4Roll = applyM4CarbineModifier(shooterIsMaster, baseRoll);

  // 记录原始骰值供客户端骰子动画使用（展示未修饰的真实 D6 结果）
  // lastShootRoll 记录原始 D6（1-6）供动画展示；resolution 用修饰后 baseRoll
  const s0 = { ...G, lastShootRoll: rawD6 };

  // === 角色 SHOOT 修饰链 ===
  // 天蝎·毒针 / 金牛·号角
  // 灵雕师·雕琢（最高优先级，override 不可改）
  // hook 注入: opts.diceModifierHint 用于哈雷·冲击的免费 SHOOT
  let result: 'kill' | 'move' | 'miss';
  let preState: SetupState = s0;
  // 本次 SHOOT 的最终结算点数（处女·完美据此判断）
  let settledRoll: number;

  // 灵雕师·雕琢：override 模式，直接用 target 手牌数当骰值
  if (shooter.characterId === 'thief_soul_sculptor') {
    const finalRoll = applySoulSculptorCarve(target.hand.length);
    settledRoll = finalRoll;
    result = resolveShootCustom(finalRoll, deathFaces, opts.moveFaces);
  } else if (
    shooter.characterId === 'thief_scorpius' &&
    canUseSkill(shooter, SCORPIUS_SKILL_ID, 'ownTurnOncePerTurn')
  ) {
    const roll2 = random.D6();
    const finalRoll = applyScorpiusPoison(baseRoll, roll2);
    settledRoll = finalRoll;
    result = resolveShootCustom(finalRoll, deathFaces, opts.moveFaces);
    preState = markSkillUsed(preState, ctx.currentPlayer, SCORPIUS_SKILL_ID);
  } else if (shooter.characterId === 'thief_taurus' && isTaurusHornCard(cardId)) {
    // 金牛：先按 target 骰算 base result；若非 kill 再掷 self 骰看是否 override 为 kill
    // 号角只对【SHOOT】生效，刺客之王 / 爆甲螺旋 / 炸裂弹头不触发（docs/manual/05-dream-thieves.md 金牛 75 行）
    settledRoll = baseRoll;
    const baseResult = resolveShootCustom(baseRoll, deathFaces, opts.moveFaces);
    if (baseResult !== 'kill') {
      const selfRoll = random.D6();
      result = applyTaurusHorn(baseRoll, selfRoll) === 'kill' ? 'kill' : baseResult;
    } else {
      result = baseResult;
    }
  } else {
    // 通用路径：使用 M4 修饰后骰值（梦主 SHOOT 时 -1，盗梦者 SHOOT 时恒等）
    settledRoll = postM4Roll;
    result = resolveShootCustom(postM4Roll, deathFaces, opts.moveFaces);
  }

  // 木星·雷霆：梦主使用 SHOOT 类，目标骰 < 梦主层 → 直接击杀
  // cards-data.json dm_jupiter_peak 雷霆 + manual §50 "叠加 M4 -1"
  if (result !== 'kill') {
    if (shouldJupiterThunderKill(shooter.characterId, shooter.currentLayer, postM4Roll)) {
      result = 'kill';
    }
  }

  let s = discardCard(preState, ctx.currentPlayer, cardId);
  // 水星·逆流：贿赂者对梦主出牌 → 梦主先收入
  s = applyMercuryReverse(s, ctx.currentPlayer, cardId, targetPlayerID) ?? s;

  if (result === 'kill') {
    // 白羊·星尘 onKilled 响应（简化 pending，可替换为完整响应栈）
    // 对照：docs/manual/05-dream-thieves.md 白羊 62-71 行
    // 注：击杀结算会把被害者挪进迷失层，所以先记下原所在层
    const victimLayer = s.players[targetPlayerID]!.currentLayer;
    s = killPlayer(s, targetPlayerID, ctx.currentPlayer);
    if (canAriesStardustTrigger(s, targetPlayerID, victimLayer)) {
      const ariesID = findAliveAriesID(s)!;
      s = {
        ...s,
        pendingAriesChoice: {
          ariesID,
          victimLayer,
          victimID: targetPlayerID,
        },
      };
    }
  } else if (result === 'move') {
    // on-move 副作用：弃目标特定手牌
    if (opts.extraOnMove) {
      const tp = s.players[targetPlayerID]!;
      const dropped = tp.hand.filter((id) =>
        opts.extraOnMove === 'discard_unlocks' ? id === 'action_unlock' : isShootClassCard(id),
      );
      if (dropped.length > 0) {
        s = discardCards(s, targetPlayerID, dropped);
      }
    }
    // 相邻层选择（1<->2, 2<->3, 3<->4；L1/L4 唯一相邻层自动移动；L2/L3 两选一 → 挂起）
    // 规则：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
    // 射手·禁足：opts.preventMove 令目标不移动
    if (!opts.preventMove) {
      const cur = s.players[targetPlayerID]!.currentLayer;
      const choices = computeShootMoveChoices(cur);
      if (choices.length === 1) {
        // L1→[2] / L4→[3]：唯一相邻层，自动移动 + 继续结算
        s = movePlayerToLayer(s, targetPlayerID, choices[0]!);
      } else if (choices.length >= 2) {
        // L2/L3：挂起由发动方（ctx.currentPlayer）选择；之后的结算推迟到 resolveShootMove
        s = {
          ...s,
          pendingShootMove: {
            shooterID: ctx.currentPlayer,
            targetPlayerID,
            cardId,
            extraOnMove: opts.extraOnMove,
            choices,
          },
        };
        return incrementMoveCounter(s);
      }
      // choices.length === 0（理论不会发生，因为 layer 必在 1..4）：兜底不移动
    }
  }

  // SHOOT 结算完成后检查处女·完美（按最终点数判断是否为 6）
  //   注意：choices.length>=2 的挂起分支已在上方 return（命中「移动」的点数不会是 6，不会触发完美），
  //   此处仅覆盖 kill / miss / L1L4 自动移动 / preventMove 情形
  s = settleVirgoPerfect(s, settledRoll);
  return incrementMoveCounter(s);
}

/**
 * 计算 SHOOT 命中 move 时，目标可去的相邻层列表（排除迷失层 0）。
 *   L1 → [2] | L4 → [3] | L2 → [1,3] | L3 → [2,4]
 *   对照：docs/manual/04-action-cards.md "移动到相邻的另一层梦境的效果不会让玩家进入迷失层"
 */
export function computeShootMoveChoices(currentLayer: number): number[] {
  const adj: number[] = [];
  if (currentLayer - 1 >= 1) adj.push(currentLayer - 1);
  if (currentLayer + 1 <= 4) adj.push(currentLayer + 1);
  return adj;
}
