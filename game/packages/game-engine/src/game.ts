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
import { resolveShoot, resolveShootCustom } from './dice.js';
import {
  applyPointmanAssault,
  applyInterpreterForeshadow,
  applyChessTranspose,
} from './engine/skills.js';
import type { CardID, Faction } from '@icgame/shared';

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

            // MVP：给玩家随机分配角色
            // 梦主从 MASTER_CHAR_POOL 选，盗梦者从 THIEF_CHAR_POOL 选（不重）
            const masterPool: CardID[] = ['dm_fortress', 'dm_chess'];
            const thiefPool: CardID[] = [
              'thief_pointman',
              'thief_dream_interpreter',
              'thief_space_queen',
              'thief_joker',
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
          return beginTurn(G, ctx.currentPlayer);
        },
      },
      // 所有 move 扁平化（不用 BGIO stages）
      moves: {
        // --- 抽牌阶段 ---
        doDraw: {
          move: ({ G, ctx }: MoveCtx) => {
            if (!guardTurnPhase(G, ctx, 'draw')) return INVALID_MOVE;
            // 抽牌前后对比推出 drawnCards（用于先锋技能触发）
            const beforeHand = G.players[G.currentPlayerID]?.hand ?? [];
            let s = drawCards(G, G.currentPlayerID);
            const afterHand = s.players[G.currentPlayerID]?.hand ?? [];
            const drawn = afterHand.slice(beforeHand.length);
            // 先锋技能：抽到 action_dream_transit 则额外抽 2 张
            s = applyPointmanAssault(s, G.currentPlayerID, drawn);
            s = setTurnPhase(s, 'action');
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
            return setTurnPhase(s, 'discard');
          },
          client: false,
        },
        playShoot: {
          move: ({ G, ctx, random }: MoveCtx, targetPlayerID: string, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            const shooter = G.players[ctx.currentPlayer];
            const target = G.players[targetPlayerID];
            if (!shooter || !target) return INVALID_MOVE;
            if (!target.isAlive) return INVALID_MOVE;
            if (!shooter.hand.includes(cardId)) return INVALID_MOVE;

            const roll = random.D6();
            const result = resolveShoot(roll);
            let s = discardCard(G, ctx.currentPlayer, cardId);

            if (result === 'kill') {
              const targetPlayer = s.players[targetPlayerID]!;
              const handover = targetPlayer.hand.slice(0, 2);
              s = {
                ...s,
                players: {
                  ...s.players,
                  [targetPlayerID]: {
                    ...targetPlayer,
                    isAlive: false,
                    deathTurn: s.turnNumber,
                    hand: targetPlayer.hand.slice(2),
                  },
                  [ctx.currentPlayer]: {
                    ...s.players[ctx.currentPlayer]!,
                    hand: [...s.players[ctx.currentPlayer]!.hand, ...handover],
                    shootCount: s.players[ctx.currentPlayer]!.shootCount + 1,
                  },
                },
              };
              s = movePlayerToLayer(s, targetPlayerID, 0);
            } else if (result === 'move') {
              const currentLayer = target.currentLayer;
              const direction = currentLayer >= 4 ? -1 : 1;
              const newLayer = Math.max(1, Math.min(4, currentLayer + direction));
              s = movePlayerToLayer(s, targetPlayerID, newLayer);
            }

            return incrementMoveCounter(s);
          },
          client: false,
        },
        // SHOOT·刺客之王：目标任意层；[1/2] 死亡 [3/4/5] 移动相邻层
        // 对照：docs/manual/04-action-cards.md SHOOT·刺客之王
        playShootKing: {
          move: ({ G, ctx, random }: MoveCtx, targetPlayerID: string, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (cardId !== 'action_shoot_king') return INVALID_MOVE;
            return applyShootVariant(G, ctx, random, targetPlayerID, cardId, {
              sameLayerRequired: false,
              deathFaces: [1, 2],
              moveFaces: [3, 4, 5],
              extraOnMove: null,
            });
          },
          client: false,
        },
        // SHOOT·爆甲螺旋：同层；[1/2] 死 [3/4/5] 弃 target 所有解封 + 移动
        playShootArmor: {
          move: ({ G, ctx, random }: MoveCtx, targetPlayerID: string, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (cardId !== 'action_shoot_armor') return INVALID_MOVE;
            return applyShootVariant(G, ctx, random, targetPlayerID, cardId, {
              sameLayerRequired: true,
              deathFaces: [1, 2],
              moveFaces: [3, 4, 5],
              extraOnMove: 'discard_unlocks',
            });
          },
          client: false,
        },
        // SHOOT·炸裂弹头：同层；[1/2] 死 [3/4/5] 弃 target 所有 SHOOT 类 + 移动
        playShootBurst: {
          move: ({ G, ctx, random }: MoveCtx, targetPlayerID: string, cardId: CardID) => {
            if (!guardTurnPhase(G, ctx, 'action')) return INVALID_MOVE;
            if (G.pendingGraft || G.pendingGravity) return INVALID_MOVE;
            if (cardId !== 'action_shoot_burst') return INVALID_MOVE;
            return applyShootVariant(G, ctx, random, targetPlayerID, cardId, {
              sameLayerRequired: true,
              deathFaces: [1, 2],
              moveFaces: [3, 4, 5],
              extraOnMove: 'discard_shoots',
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
            if (player.successfulUnlocksThisTurn >= G.maxUnlockPerTurn) return INVALID_MOVE;

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
            return s;
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

            let s = discardCard(G, ctx.currentPlayer, cardId);
            s = movePlayerToLayer(s, ctx.currentPlayer, targetLayer);
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
            s = movePlayerToLayer(s, ctx.currentPlayer, targetLayer);
            s = movePlayerToLayer(s, targetPlayerID, selfLayer);
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
            s = movePlayerToLayer(s, targetPlayerID, self.currentLayer);
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
            if (G.pendingGraft) return INVALID_MOVE;
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
            if (G.pendingGraft) return INVALID_MOVE;
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

interface ShootVariantOpts {
  sameLayerRequired: boolean;
  deathFaces: number[];
  moveFaces: number[];
  extraOnMove: 'discard_unlocks' | 'discard_shoots' | null;
}

/** SHOOT 变体共享结算：kill/move/miss + 可选 on-move 弃牌副作用
 *  对照：docs/manual/04-action-cards.md SHOOT·刺客之王 / 爆甲螺旋 / 炸裂弹头
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
    return INVALID_MOVE;
  }

  const roll = random.D6();
  const result = resolveShootCustom(roll, opts.deathFaces, opts.moveFaces);
  let s = discardCard(G, ctx.currentPlayer, cardId);

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

  return incrementMoveCounter(s);
}
