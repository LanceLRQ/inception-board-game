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
import { PLAYER_COUNT_CONFIGS, BASE_DRAW_COUNT } from './config.js';
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
  recordCardPlayed,
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
  ARCHITECT_SKILL_ID,
  applyShadeFollow,
  applyHlninoFlow,
  applyExtractorBounty,
  applyForgerExchange,
  isTerroristCrossLayerActive,
  type ForgerExchange,
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
  isAquariusUnlimitedActive,
  getEffectiveMaxUnlockPerTurn,
  checkHarborWin,
  checkNeptuneWin,
  isJupiterPeakWorldActive,
  isJupiterPeakLayerOK,
  shouldJupiterThunderKill,
  applyM4CarbineModifier,
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
  applyMercuryRouteExtraFailBribe,
  applySudgerVerdict,
  SUDGER_SKILL_ID,
  applySagittariusHeartLock,
  SAGITTARIUS_HEART_LOCK_SKILL_ID,
  applySpaceQueenStashTop,
  applyBlackHoleLevy,
  applyBlackHoleAbsorb,
  applyImperialCityWorldShoot,
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
} from './engine/skills.js';
import { shiftGuardAndRestore } from './engine/abilities/shift-guard.js';
import { dispatchPassives } from './engine/abilities/dispatch-helpers.js';
import {
  openResponseWindow,
  respondToWindow,
  passOnResponse,
} from './engine/abilities/response-chain.js';
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

// --- 内部 helper：M4-4 金币金库开启奖励 ---
// 规则：打开金币类金库时，打开者额外获得 1 张贿赂（从 bribePool 随机抽 1 张）
// 对照：docs/manual/08-appendix.md M4 梦主优势第 4 条
// 实现：复用 masterDealBribe 的派发逻辑（inPool → dealt/deal 状态流转）；
// 由 resolveUnlock / 其他金库打开路径在 applyUnlockSuccess 之后显式调用。
function applyCoinVaultBribeReward(
  state: SetupState,
  random: BGIORandom,
  targetPlayerID: string,
): SetupState {
  const target = state.players[targetPlayerID];
  if (!target || !target.isAlive) return state;
  const poolIdxs = state.bribePool
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.status === 'inPool');
  if (poolIdxs.length === 0) return state;
  const shuffled = random.Shuffle(poolIdxs);
  const pick = shuffled[0]!;
  const bribe = pick.b;
  const isDeal = bribe.id.startsWith('bribe-deal-');
  const nextPool = state.bribePool.map((b, i) =>
    i === pick.i
      ? {
          ...b,
          status: (isDeal ? 'deal' : 'dealt') as BribeSetup['status'],
          heldBy: targetPlayerID,
          originalOwnerId: targetPlayerID,
        }
      : b,
  );
  return {
    ...state,
    bribePool: nextPool,
    players: {
      ...state.players,
      [targetPlayerID]: {
        ...target,
        bribeReceived: target.bribeReceived + 1,
        faction: isDeal ? ('master' as Faction) : target.faction,
      },
    },
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

// --- 内部 helper：解封成功完整副作用链 ---
// W19-B F3：由 passResponse（全员 pass）与 resolveUnlock（兜底）共享。
// 顺序：applyUnlockSuccess → M4-4 金币金库贿赂奖励 → 译梦师抽 2 → 梦境猎手·满载 → onUnlock passive。
// 对照：docs/manual/04-action-cards.md 解封 + docs/manual/08-appendix.md M4-4
function resolveUnlockFull(G: SetupState, random: BGIORandom): SetupState {
  if (!G.pendingUnlock) return G;
  const unlockerId = G.pendingUnlock.playerID;
  let s = applyUnlockSuccess(G);
  const coinVault = findJustOpenedCoinVault(G.vaults, s.vaults);
  if (coinVault?.openedBy) {
    s = applyCoinVaultBribeReward(s, random, coinVault.openedBy);
  }
  s = applyInterpreterForeshadow(s, unlockerId);
  s = applyExtractorBounty(s, unlockerId);
  s = dispatchPassives(s, 'onUnlock').state;
  return s;
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
              // C1 · 水星·航路：世界观（+1 fail 贿赂）+ 逆流 SHOOT 响应已接入
              // 注：非 SHOOT 类牌的逆流响应依赖完整响应窗口（并入 P2）
              'dm_mercury_route',
              // C2 · 金星·镜界：重影技能（applyVenusDouble + useVenusDouble）+ 镜界世界观（applyVenusMirrorWorld）
              //   均已完整实装并通过 mercury-joker-swan.test.ts / venus-mirror-world.test.ts 覆盖
              'dm_venus_mirror',
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
          // 梦主 M4-3：若梦主回合开始时处于迷失层（layer 0），自动原地复活
          //   —— 规则：梦主无需弃手牌、无需回 layer 1；直接在当前迷失层站起来
          //   —— 对照：docs/manual/08-appendix.md M4 梦主优势第 3 条
          // 注意：currentLayer === 0 即"迷失层"；复活目的地统一定为 layer 1
          //   （规则原文"原地站起来"在多数版本中被解释为回到 layer 1，
          //    因为 layer 0 不是正式的梦境层，是迷失区。这里选择 layer 1
          //    更符合多数对局实践，且便于后续 passive 触发）
          if (ctx.currentPlayer === s.dreamMasterID) {
            const master = s.players[s.dreamMasterID];
            if (master && (master.currentLayer === 0 || !master.isAlive)) {
              s = {
                ...s,
                players: {
                  ...s.players,
                  [s.dreamMasterID]: { ...master, isAlive: true, deathTurn: null },
                },
              };
              s = movePlayerToLayer(s, s.dreamMasterID, 1);
            }
          }
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
          // 白羊·星尘：回合末未消费的 pending 强制清空，防卡死
          if (s.pendingAriesChoice) {
            s = { ...s, pendingAriesChoice: null };
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
            const isMaster = currentPlayer?.faction === 'master';
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

        // 小丑·赌博（略过抽牌阶段 → 掷骰 → 抽 D6 张）
        // 对照：docs/manual/05-dream-thieves.md 小丑
        // MVP：下回合强制全弃的惩罚尚未实装（需 forcedDiscardAllNextTurn 字段；预留）
        playJokerGamble: {
          move: ({ G, ctx, random }: MoveCtx) => {
            if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
            const player = G.players[G.currentPlayerID];
            if (!player || !player.isAlive) return INVALID_MOVE;
            if (player.characterId !== 'thief_joker') return INVALID_MOVE;
            const roll = random.D6();
            const count = jokerDrawCount(roll);
            let s = drawCards(G, G.currentPlayerID, count);
            // 罚则：下回合本玩家 discard 阶段强制全弃
            // 记录当前 turnNumber 作为"设防时刻"，discard 检查时仅在 turnNumber 前进后触发
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
            s = setTurnPhase(s, 'action');
            // 进入行动阶段 → 触发 onActionPhase passive
            s = dispatchPassives(s, 'onActionPhase').state;
            return s;
          },
          client: false,
        },

        // 黑天鹅·巡演（略过抽牌阶段 → 分发所有手牌 → 抽 4）
        // 对照：docs/manual/05-dream-thieves.md 黑天鹅
        playBlackSwanTour: {
          move: ({ G, ctx }: MoveCtx, distribution: Record<string, CardID[]>) => {
            if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
            const applied = applyBlackSwanTour(G, G.currentPlayerID, distribution);
            if (applied === null) return INVALID_MOVE;
            let s = setTurnPhase(applied, 'action');
            s = dispatchPassives(s, 'onActionPhase').state;
            return s;
          },
          client: false,
        },

        // 黑洞·吞噬（抽牌阶段替代 doDraw：同层每个玩家给 1 张手牌）
        // 对照：docs/manual/05-dream-thieves.md 黑洞
        playBlackHoleLevy: {
          move: ({ G, ctx }: MoveCtx, giverPicks: Record<string, CardID>) => {
            if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
            const applied = applyBlackHoleLevy(G, G.currentPlayerID, giverPicks);
            if (applied === null) return INVALID_MOVE;
            let s = setTurnPhase(applied, 'action');
            s = dispatchPassives(s, 'onActionPhase').state;
            return s;
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
        // 对照：docs/manual/06-dream-master.md 皇城
        useImperialCityWorldShoot: {
          move: ({ G, ctx, random }: MoveCtx, targetID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const master = G.players[G.dreamMasterID];
            if (!master || master.characterId !== 'dm_imperial_city') return INVALID_MOVE;
            const roll = random.D6();
            const applied = applyImperialCityWorldShoot(G, ctx.currentPlayer, targetID, roll);
            if (applied === null) return INVALID_MOVE;
            return incrementMoveCounter(applied);
          },
          client: false,
        },

        // 复活：出牌阶段弃 2 张手牌复活自己或他人（密道世界观：弃 1 张穿梭剂）
        // 对照：docs/manual/03-game-flow.md 复活 / docs/manual/06-dream-master.md 密道
        playRevive: {
          move: ({ G, ctx }: MoveCtx, targetID: string | null, discardedCardIds: CardID[]) => {
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
            // 嫁接/万有引力未结算不得结束行动阶段
            if (G.pendingGraft) return INVALID_MOVE;
            if (G.pendingGravity) return INVALID_MOVE;
            // SHOOT 发动方选层未完成前不得结束行动阶段
            //   对照：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
            if (G.pendingShootMove) return INVALID_MOVE;
            // W19-B F4a：解封响应 / 梦境窥视三段式未结算不得结束行动阶段
            // 防止 bot 自回合打完 playUnlock 或 playPeek 后直接 endActionPhase 跳过结算
            if (G.pendingUnlock) return INVALID_MOVE;
            if (G.pendingResponseWindow) return INVALID_MOVE;
            if (G.pendingPeekDecision) return INVALID_MOVE;
            if (G.peekReveal) return INVALID_MOVE;
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
            preventMove?: boolean,
          ) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove || G.pendingSudgerRolls)
              return INVALID_MOVE;
            const self = G.players[ctx.currentPlayer];
            if (!self || !self.isAlive) return INVALID_MOVE;
            if (self.characterId !== 'thief_sudger_of_mind') return INVALID_MOVE;
            if (!self.hand.includes(cardId)) return INVALID_MOVE;
            if (!isShootClassCard(cardId)) return INVALID_MOVE;
            const target = G.players[targetPlayerID];
            if (!target || !target.isAlive || targetPlayerID === ctx.currentPlayer)
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
              action_shoot_king: { deathFaces: [1, 2], moveFaces: [3, 4, 5], extraOnMove: null },
              action_shoot_armor: {
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
              const tp = s.players[pending.targetPlayerID]!;
              const handover = tp.hand.slice(0, 2);
              s = {
                ...s,
                pendingSudgerRolls: null,
                players: {
                  ...s.players,
                  [pending.targetPlayerID]: {
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
              s = movePlayerToLayer(s, pending.targetPlayerID, 0);
              s = dispatchPassives(s, 'onKilled').state;
            } else if (result === 'move') {
              if (pending.extraOnMove) {
                const tp = s.players[pending.targetPlayerID]!;
                const keep: CardID[] = [];
                const dropped: CardID[] = [];
                for (const id of tp.hand) {
                  const shouldDrop =
                    pending.extraOnMove === 'discard_unlocks'
                      ? id === 'action_unlock'
                      : isShootClassCard(id);
                  (shouldDrop ? dropped : keep).push(id);
                }
                if (dropped.length > 0) {
                  s = {
                    ...s,
                    players: { ...s.players, [pending.targetPlayerID]: { ...tp, hand: keep } },
                    deck: { ...s.deck, discardPile: [...s.deck.discardPile, ...dropped] },
                  };
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

            s = dispatchPassives(s, 'onAfterShoot').state;
            return recordCardPlayed(incrementMoveCounter(s), pending.cardId);
          },
          client: false,
        },
        // 打出梦魇解封 - 翻开指定层的面朝下梦魇；后续由梦主选择发动/弃掉
        // 对照：docs/manual/04-action-cards.md 梦魇解封
        playNightmareUnlock: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID, layer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
            if (cardId !== 'action_shoot_dream_transit') return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
        // SHOOT 结算判定 move 后的"发动方选层"响应：L2/L3 目标由发动方选相邻层
        //   对照：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
        //   生命周期：applyShootVariant 挂起 pendingShootMove → 本 move 消费 + 触发 onAfterShoot
        //   仅 shooterID 可消费（非当前回合玩家也能操作，因 SHOOT 发动可能跨 turnPhase 时机；故不 guard turnPhase）
        resolveShootMove: {
          move: ({ G, ctx }: MoveCtx, layer: number) => {
            const p = G.pendingShootMove;
            if (!p) return INVALID_MOVE;
            if (ctx.currentPlayer !== p.shooterID) return INVALID_MOVE;
            if (!Number.isInteger(layer) || !p.choices.includes(layer)) return INVALID_MOVE;
            let s: SetupState = movePlayerToLayer(G, p.targetPlayerID, layer);
            s = { ...s, pendingShootMove: null };
            // 延后的 onAfterShoot passive 在此触发一次（处女·完美监听等）
            s = dispatchPassives(s, 'onAfterShoot').state;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
              action_shoot_king: {
                sameLayerRequired: false,
                deathFaces: [1, 2],
                moveFaces: [3, 4, 5],
                extraOnMove: null,
              },
              action_shoot_armor: {
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
        // W19-B F3：playUnlock 成功后即刻打开响应窗口（对照：§解封 使用时机②
        //   "任意玩家使用【解封】的效果①时"），允许其他玩家出效果②抵消
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
            }
            return recordCardPlayed(s, cardId);
          },
          client: false,
        },
        // resolveUnlock：兜底入口 - 在响应窗口未接入或 bot 直接推进时可用。
        // W19-B F3：正常流程下由 passResponse 在"全员 pass"时自动触发 resolveUnlockFull。
        //   该 move 仍保留：供 bot/无响应窗口场景 fallback；会强制关闭可能残留的窗口。
        resolveUnlock: {
          move: ({ G, random }: MoveCtx) => {
            if (!G.pendingUnlock) return INVALID_MOVE;
            // 强制退栈：若仍挂着响应窗口（兜底路径），回退到父窗口或 null
            let s: SetupState = G.pendingResponseWindow
              ? { ...G, pendingResponseWindow: G.pendingResponseWindow.parentWindow ?? null }
              : G;
            s = resolveUnlockFull(s, random);
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove || G.pendingUnlock)
              return INVALID_MOVE;
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

        // 响应解封效果②：抵消一张正在结算的【解封】。
        // 对照：docs/manual/04-action-cards.md §解封 效果②
        // W19-B F2：补齐 responder 校验 + 持卡校验 + 弃牌 + 关闭响应窗口。
        //   签名：respondCancelUnlock(responderID?)；未传参时 fallback 到 ctx.currentPlayer
        //   （兼容 bot 原无参调用；真实 BGIO 场景应由 unlocker 代理调用时显式传 responderID）
        respondCancelUnlock: {
          move: ({ G, ctx }: MoveCtx, responderID?: string) => {
            const rid = responderID ?? ctx.currentPlayer;
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
        // W19-B F2：校验 responder 合法 & 未重复 pass；全员 pass 时自动进入 resolveUnlockFull。
        //   签名：passResponse(responderID?)；未传参 fallback 到 ctx.currentPlayer
        passResponse: {
          move: ({ G, ctx, random }: MoveCtx, responderID?: string) => {
            const rid = responderID ?? ctx.currentPlayer;
            const w = G.pendingResponseWindow;
            if (!w) return INVALID_MOVE;
            if (!w.responders.includes(rid)) return INVALID_MOVE;
            if (w.responded.includes(rid)) return INVALID_MOVE;
            // 本次 pass 后是否所有 responder 都已响应
            const isLastPass = w.responded.length + 1 >= w.responders.length;
            let s = passOnResponse(G, rid);
            // 全员 pass 且源是解封效果① → 自动结算为"解封成功"（含译梦师/M4-4 等副作用）
            if (isLastPass && w.sourceAbilityID === 'action_unlock_effect_1' && s.pendingUnlock) {
              s = resolveUnlockFull(s, random);
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
            return recordCardPlayed(incrementMoveCounter(s), cardId);
          },
          client: false,
        },
        // 打出 KICK - 与目标玩家交换梦境层
        // 对照：docs/manual/04-action-cards.md KICK
        playKick: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID, targetPlayerID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (isMazeBlocked(G, targetPlayerID, 'playKick')) return INVALID_MOVE;
            const self = G.players[ctx.currentPlayer];
            const target = G.players[targetPlayerID];
            if (!self || !target) return INVALID_MOVE;
            if (targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
            if (!self.isAlive || !target.isAlive) return INVALID_MOVE;
            if (!self.hand.includes(cardId)) return INVALID_MOVE;

            let s = discardCard(G, ctx.currentPlayer, cardId);
            // 水星·逆流：贿赂者对梦主出牌 → 梦主先收入
            s = applyMercuryReverse(s, ctx.currentPlayer, cardId, targetPlayerID) ?? s;
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
            return recordCardPlayed(incrementMoveCounter(s), cardId);
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
        // 打出梦境窥视 · 效果①（盗梦者使用）
        // 对照：docs/manual/04-action-cards.md 梦境窥视 · 解析
        //   三段式：playPeek → [梦主决策是否派贿赂] → [盗梦者私密查看金库]
        //   W19-B F5：改 MVP 占位为完整三段式。贿赂池有可派牌 → 挂 pendingPeekDecision；
        //             贿赂池已派完（无 inPool）→ 跳过决策，直接挂 peekReveal（无负担窥视）。
        playPeek: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID, targetLayer: number) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (cardId !== 'action_dream_peek') return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            if (!player || !player.isAlive) return INVALID_MOVE;
            // 效果①仅盗梦者；梦主效果②通过独立 move 处理（F10 待实装）
            if (player.faction !== 'thief') return INVALID_MOVE;
            if (!player.hand.includes(cardId)) return INVALID_MOVE;
            if (targetLayer < 1 || targetLayer > 4) return INVALID_MOVE;
            const hasVault = G.vaults.some((v) => v.layer === targetLayer);
            if (!hasVault) return INVALID_MOVE;
            // 防重入
            if (G.pendingPeekDecision) return INVALID_MOVE;
            if (G.peekReveal) return INVALID_MOVE;

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
                  revealKind: 'vault',
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
        //   W19-B F6：deal=true 随机派 1 张（命中 DEAL 转阵营）；deal=false 或 inPool=0 → 跳过派发。
        //   两分支终态一致：清 pendingPeekDecision + 挂 peekReveal（由 peeker 通过 peekerAcknowledge 消费）。
        masterPeekBribeDecision: {
          move: ({ G, ctx, random }: MoveCtx, deal: boolean) => {
            if (!G.pendingPeekDecision) return INVALID_MOVE;
            // 回合外响应 move：不 guard ctx.currentPlayer（BGIO 中 ctx.currentPlayer 指当前回合玩家，
            //   而非 move 调用者；盗梦者回合触发 peek 挂起时 currentPlayer=盗梦者，梦主代发此
            //   决策时仍然用当前 active client 发起，身份由 pendingPeekDecision 本身作为凭证）。
            //   参考 passResponse 范式。联机模式下的身份校验由 net/ws 网关在转发前处理。
            void ctx; // 保留 ctx 以便未来做 playerID 校验（服务端场景）
            const { peekerID, targetLayer } = G.pendingPeekDecision;
            const peeker = G.players[peekerID];
            if (!peeker) return INVALID_MOVE;

            let s: SetupState = G;
            if (deal) {
              const poolIdxs = G.bribePool
                .map((b, i) => ({ b, i }))
                .filter(({ b }) => b.status === 'inPool');
              // inPool=0 竞态：当作 skip 处理（不改 bribePool / bribeReceived）
              if (poolIdxs.length > 0) {
                const shuffled = random.Shuffle(poolIdxs);
                const pick = shuffled[0]!;
                const bribe = pick.b;
                const isDeal = bribe.id.startsWith('bribe-deal-');
                const nextPool = G.bribePool.map((b, i) =>
                  i === pick.i
                    ? {
                        ...b,
                        status: (isDeal ? 'deal' : 'dealt') as BribeSetup['status'],
                        heldBy: peekerID,
                        originalOwnerId: peekerID,
                      }
                    : b,
                );
                s = {
                  ...G,
                  bribePool: nextPool,
                  players: {
                    ...G.players,
                    [peekerID]: {
                      ...peeker,
                      bribeReceived: peeker.bribeReceived + 1,
                      faction: isDeal ? ('master' as Faction) : peeker.faction,
                    },
                  },
                };
              }
            }
            // 清 pending + 挂 peekReveal（peeker 私密查看）
            return {
              ...s,
              pendingPeekDecision: null,
              peekReveal: {
                peekerID,
                revealKind: 'vault',
                vaultLayer: targetLayer,
              },
            };
          },
          client: false,
        },
        // 打出梦境窥视 · 效果②（梦主使用）
        // 对照：docs/manual/04-action-cards.md 梦境窥视 效果②
        //   "仅梦主使用，查看一名盗梦者的所有贿赂牌。"
        //   使用目标："一名已被贿赂的盗梦者"
        //   W19-B F10：梦主对一名已被贿赂的盗梦者打出此牌，弃牌后挂 peekReveal.bribe；
        //              peeker=梦主自己；由 peekerAcknowledge 清理（复用）。
        playPeekMaster: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID, targetThiefID: string) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (cardId !== 'action_dream_peek') return INVALID_MOVE;
            if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
            const master = G.players[ctx.currentPlayer];
            if (!master || !master.isAlive) return INVALID_MOVE;
            if (!master.hand.includes(cardId)) return INVALID_MOVE;
            // 目标校验：target 存在 / 非梦主自身 / 在世 / 盗梦者阵营 / 已持贿赂
            if (targetThiefID === ctx.currentPlayer) return INVALID_MOVE;
            const target = G.players[targetThiefID];
            if (!target || !target.isAlive) return INVALID_MOVE;
            if (target.faction !== 'thief') return INVALID_MOVE;
            const hasBribe = G.bribePool.some((b) => b.heldBy === targetThiefID);
            if (!hasBribe) return INVALID_MOVE;
            // 防重入
            if (G.pendingPeekDecision) return INVALID_MOVE;
            if (G.peekReveal) return INVALID_MOVE;

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
        //   W19-B F8：必须由 peekerID 本人调用。
        //   W19-B F10：对 revealKind='bribe' 分支同样适用（peeker=梦主）。
        peekerAcknowledge: {
          move: ({ G, ctx }: MoveCtx) => {
            if (!G.peekReveal) return INVALID_MOVE;
            if (ctx.currentPlayer !== G.peekReveal.peekerID) return INVALID_MOVE;
            const s: SetupState = { ...G, peekReveal: null };
            return incrementMoveCounter(s);
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
        // 射手·穿心：击杀后修改任意层心锁 ±1（回合限 1 次）
        // 对照：docs/manual/05-dream-thieves.md 射手
        useSagittariusHeartLock: {
          move: ({ G, ctx }: MoveCtx, layer: number, delta: -1 | 1) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const self = G.players[ctx.currentPlayer];
            if (!self || !self.isAlive) return INVALID_MOVE;
            if (self.characterId !== 'thief_sagittarius') return INVALID_MOVE;
            if (!canUseSkill(self, SAGITTARIUS_HEART_LOCK_SKILL_ID, 'ownTurnOncePerTurn'))
              return INVALID_MOVE;
            if (!G.layers[layer]) return INVALID_MOVE;
            // cap = 该层初始心锁数（对照 config）
            const heartLocksTuple = PLAYER_COUNT_CONFIGS[G.playerOrder.length]?.heartLocks;
            const cap = heartLocksTuple?.[layer - 1] ?? 3;
            const result = applySagittariusHeartLock(G, layer, delta, cap);
            if (result === null) return INVALID_MOVE;
            return markSkillUsed(result, ctx.currentPlayer, SAGITTARIUS_HEART_LOCK_SKILL_ID);
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
            for (const tid of targetIds) {
              if (isMazeBlocked(G, tid, 'playGravity')) return INVALID_MOVE;
            }
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (isMazeBlocked(G, targetPlayerID, 'playResonance')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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

        // 打出时间风暴 - 从牌库顶翻 10 张 + 本牌整体移出游戏
        // 对照：docs/manual/04-action-cards.md 时间风暴
        // 规则：使用或弃掉时都触发效果；该牌 + 被翻的 10 张均"移出游戏"，
        //      不入弃牌堆（防止被药剂师/火星·战场等回收）
        playTimeStorm: {
          move: ({ G, ctx }: MoveCtx, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
            const player = G.players[ctx.currentPlayer];
            if (!player || !player.isAlive) return INVALID_MOVE;
            if (cardId !== 'action_time_storm') return INVALID_MOVE;
            if (!player.hand.includes(cardId)) return INVALID_MOVE;

            // 从手牌中移除该牌（注：此牌效果结算后"移出游戏"，不入弃牌堆）
            const handIdx = player.hand.indexOf(cardId);
            const newHand = [...player.hand];
            newHand.splice(handIdx, 1);

            // 从牌库顶翻 10 张（不足则全翻）
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
                discardPile: G.deck.discardPile,
              },
              // 本牌 + 被翻的 10 张均移出游戏
              removedFromGame: [...G.removedFromGame, cardId, ...flipped],
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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

        // 盖亚·大地：令同层其余玩家移到 ±1 层（限 2 次/回合）
        // 对照：docs/manual/05-dream-thieves.md 盖亚
        playGaiaShift: {
          move: ({ G, ctx }: MoveCtx, picks: Record<string, -1 | 1>) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove || G.pendingLibra)
              return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            if (G.pendingGraft || G.pendingGravity || G.pendingShootMove) return INVALID_MOVE;
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
            const player = G.players[ctx.currentPlayer];
            // 小丑·赌博罚则：armed 且已过"下个回合"（armedAtTurn < turnNumber）→ 强制传入 = 全手牌
            const forced =
              player &&
              typeof player.forcedDiscardArmedAtTurn === 'number' &&
              player.forcedDiscardArmedAtTurn < G.turnNumber;
            if (forced) {
              // 必须一次性弃掉全部手牌，否则拒绝
              if (cardIds.length !== player!.hand.length) return INVALID_MOVE;
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
            // 时间风暴：弃牌阶段弃掉同样触发效果，且该牌本身与翻的 10 张牌库顶
            // 均"移出游戏"而非进入弃牌堆。
            // 对照：docs/manual/04-action-cards.md 时间风暴"使用或弃掉时都触发效果"
            const stormCount = cardIds.filter((c) => c === 'action_time_storm').length;
            if (stormCount > 0) {
              const dp = [...next.deck.discardPile];
              // 1) 将 discardToLimit 误入 discardPile 的 N 张风暴抠回，改路 removedFromGame
              const extractedStorms: CardID[] = [];
              for (let i = 0; i < stormCount; i++) {
                const idx = dp.lastIndexOf('action_time_storm' as CardID);
                if (idx !== -1) {
                  dp.splice(idx, 1);
                  extractedStorms.push('action_time_storm' as CardID);
                }
              }
              // 2) 每张风暴翻 10 张牌库顶（累积 = 10 * N，不足全翻），同样进 removedFromGame
              const totalFlip = Math.min(10 * stormCount, next.deck.cards.length);
              const flipped = next.deck.cards.slice(0, totalFlip);
              const remaining = next.deck.cards.slice(totalFlip);
              next = {
                ...next,
                deck: { cards: remaining, discardPile: dp },
                removedFromGame: [...next.removedFromGame, ...extractedStorms, ...flipped],
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
            if (player && player.hand.length > 5 && !sheltered) return INVALID_MOVE;
            // 小丑·赌博罚则：armed 已过期且手牌 > 0 → 不得跳过（必须走 doDiscard 全弃）
            if (
              player &&
              typeof player.forcedDiscardArmedAtTurn === 'number' &&
              player.forcedDiscardArmedAtTurn < G.turnNumber &&
              player.hand.length > 0
            ) {
              return INVALID_MOVE;
            }
            events.endTurn();
            return G;
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
  /** 射手·禁足：SHOOT 结果为 move 时阻止目标移动 */
  preventMove?: boolean;
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
  // D 批次：M4 卡宾枪全局化 —— 梦主使用 SHOOT 时目标骰 -1（基线梦主优势）
  // 对照：docs/manual/03-game-flow.md §80-81 M4 卡宾枪道具；§111 印证 M4 先于效果处理
  // 仅在"未被角色技能重写骰值"的通用路径生效，不影响灵雕师 override / 天蝎毒针等特殊处理
  //   （这些路径的 shooter 都是盗梦者，M4 本来就不触发）
  const shooterIsMaster = shooter.faction === 'master';
  const postM4Roll = applyM4CarbineModifier(shooterIsMaster, baseRoll);

  // 记录原始骰值供客户端骰子动画使用（展示未修饰的真实 D6 结果）
  const s0 = { ...preShootState, lastShootRoll: baseRoll };

  // === 角色 SHOOT 修饰链 ===
  // W12 Tier B: 天蝎·毒针 / 金牛·号角
  // W13 Tier A: 灵雕师·雕琢（最高优先级，override 不可改）
  // hook 注入: opts.diceModifierHint 用于哈雷·冲击的免费 SHOOT
  let result: 'kill' | 'move' | 'miss';
  let preState: SetupState = s0;

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
    // 哈雷为盗梦者，postM4Roll === baseRoll；保持原 dicePreModifier 输入
    const finalRoll = opts.dicePreModifier(baseRoll);
    result = resolveShootCustom(finalRoll, deathFaces, opts.moveFaces);
  } else {
    // 通用路径：使用 M4 修饰后骰值（梦主 SHOOT 时 -1，盗梦者 SHOOT 时恒等）
    result = resolveShootCustom(postM4Roll, deathFaces, opts.moveFaces);
  }

  // 木星·雷霆：梦主使用 SHOOT 类，目标骰 < 梦主层 → 直接击杀
  // 对照：cards-data.json dm_jupiter_peak 雷霆 + manual §50 "叠加 M4 -1"
  if (result !== 'kill') {
    if (shouldJupiterThunderKill(shooter.characterId, shooter.currentLayer, postM4Roll)) {
      result = 'kill';
    }
  }

  let s = discardCard(preState, ctx.currentPlayer, cardId);
  // 水星·逆流：贿赂者对梦主出牌 → 梦主先收入
  s = applyMercuryReverse(s, ctx.currentPlayer, cardId, targetPlayerID) ?? s;

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
    // 白羊·星尘 onKilled 响应（简化 pending，P4 W20.5 可替换为完整响应栈）
    // 对照：docs/manual/05-dream-thieves.md 白羊 62-71 行
    // 注：在 movePlayerToLayer(..., 0) 之前捕获原所在层 —— 但此处 target 已被 isAlive=false 前已被处理，
    // tp.currentLayer 仍在原层（isAlive 修改时未动 currentLayer，后续 movePlayerToLayer 才移走）
    const victimLayer = tp.currentLayer;
    s = movePlayerToLayer(s, targetPlayerID, 0);
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
    // 相邻层选择（1<->2, 2<->3, 3<->4；L1/L4 唯一相邻层自动移动；L2/L3 两选一 → 挂起）
    // 规则：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
    // 射手·禁足：opts.preventMove 令目标不移动
    if (!opts.preventMove) {
      const cur = s.players[targetPlayerID]!.currentLayer;
      const choices = computeShootMoveChoices(cur);
      if (choices.length === 1) {
        // L1→[2] / L4→[3]：唯一相邻层，自动移动 + 继续触发 onAfterShoot
        s = movePlayerToLayer(s, targetPlayerID, choices[0]!);
      } else if (choices.length >= 2) {
        // L2/L3：挂起由发动方（ctx.currentPlayer）选择；onAfterShoot 推迟到 resolveShootMove
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

  // abilities registry：SHOOT 结算完成后触发 onAfterShoot passive（处女·完美监听 roll=6）
  //   注意：choices.length>=2 的挂起分支已在上方 return，此处仅覆盖 kill / miss / L1L4 自动移动 / preventMove 情形
  s = dispatchPassives(s, 'onAfterShoot').state;
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
