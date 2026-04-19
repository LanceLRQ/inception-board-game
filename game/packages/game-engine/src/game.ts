// BGIO Game 对象 - 盗梦都市主游戏定义
// 对照：plans/design/02-game-rules-spec.md §2.1 + §7.5.1

import { INVALID_MOVE } from 'boardgame.io/core';
import { createInitialState, type SetupState } from './setup.js';
import {
  drawCards,
  discardCard,
  discardToLimit,
  beginTurn,
  setTurnPhase,
  movePlayerToLayer,
  incrementMoveCounter,
} from './moves.js';
import { resolveShoot } from './dice.js';
import type { CardID, Faction } from '@icgame/shared';

export type { SetupState } from './setup.js';

// --- BGIO Game 定义 ---
export const InceptionCityGame = {
  name: 'inception-city',
  minPlayers: 3,
  maxPlayers: 10,
  disableUndo: true,

  setup: (
    { numPlayers, random }: { numPlayers: number; random?: { Shuffle: (arr: unknown[]) => void } },
    setupData: Record<string, unknown>,
  ) => {
    const playerIds = Array.from({ length: numPlayers }, (_, i) => String(i));
    const nicknames = playerIds.map((_, i) => `Player ${i + 1}`);

    const state = createInitialState({
      playerCount: numPlayers,
      playerIds,
      nicknames,
      rngSeed: (setupData.rngSeed as string | undefined) ?? 'default',
      ruleVariant: setupData.ruleVariant as string | undefined,
      exCardsEnabled: setupData.exCardsEnabled as boolean | undefined,
      expansionEnabled: setupData.expansionEnabled as boolean | undefined,
    });

    // 洗牌
    if (random?.Shuffle) {
      random.Shuffle(state.deck.cards);
    }

    return state;
  },

  // 阶段定义
  phases: {
    setup: {
      start: true,
      moves: {
        pickCharacter: {
          move: (G: SetupState) => G,
          client: false,
        },
        completeSetup: {
          move: (
            G: SetupState,
            ctx: {
              currentPlayer: string;
              random: { Die: (n: number) => number; D6: () => number };
            },
          ) => {
            const masterIdx = ctx.random!.Die(G.playerOrder.length) - 1;
            const masterID = G.playerOrder[masterIdx]!;
            const updated = {
              ...G,
              dreamMasterID: masterID,
              players: {
                ...G.players,
                [masterID]: { ...G.players[masterID]!, faction: 'master' as Faction },
              },
            };
            // 开始第一回合
            return beginTurn(updated, masterID);
          },
          client: false,
        },
      },
      next: 'playing',
      endIf: (G: SetupState) => G.phase === 'playing',
    },

    playing: {
      turn: {
        // 回合开始
        onBegin: (
          G: SetupState,
          ctx: { currentPlayer: string; random: { Die: (n: number) => number; D6: () => number } },
        ) => {
          return beginTurn(G, ctx.currentPlayer);
        },
        // 阶段内子阶段
        stages: {
          draw: {
            moves: {
              // 抽牌
              doDraw: {
                move: (G: SetupState) => {
                  let s = drawCards(G, G.currentPlayerID);
                  s = setTurnPhase(s, 'action');
                  return s;
                },
                client: false,
              },
              // 跳过抽牌（特殊角色）
              skipDraw: {
                move: (G: SetupState) => {
                  return setTurnPhase(G, 'action');
                },
                client: false,
              },
            },
          },
          action: {
            moves: {
              // 结束行动阶段
              endActionPhase: {
                move: (G: SetupState) => {
                  return setTurnPhase(G, 'discard');
                },
                client: false,
              },
              // 打出 SHOOT（基础版）
              playShoot: {
                move: (
                  G: SetupState,
                  ctx: {
                    currentPlayer: string;
                    random: { Die: (n: number) => number; D6: () => number };
                  },
                  targetPlayerID: string,
                  cardId: CardID,
                ) => {
                  const shooter = G.players[ctx.currentPlayer];
                  const target = G.players[targetPlayerID];
                  if (!shooter || !target) return INVALID_MOVE;
                  if (!target.isAlive) return INVALID_MOVE;
                  if (!shooter.hand.includes(cardId)) return INVALID_MOVE;

                  const roll = ctx.random!.D6();
                  const result = resolveShoot(roll);
                  let s = discardCard(G, ctx.currentPlayer, cardId);

                  if (result === 'kill') {
                    // 目标死亡
                    const targetPlayer = s.players[targetPlayerID]!;
                    // 交 2 张手牌给使用者
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
                    // 移到迷失层
                    s = movePlayerToLayer(s, targetPlayerID, 0);
                  } else if (result === 'move') {
                    // 强制移动到相邻层
                    const currentLayer = target.currentLayer;
                    const direction = currentLayer >= 4 ? -1 : 1;
                    const newLayer = Math.max(1, Math.min(4, currentLayer + direction));
                    s = movePlayerToLayer(s, targetPlayerID, newLayer);
                  }

                  return incrementMoveCounter(s);
                },
                client: false,
              },
              // 梦主免费移动
              dreamMasterMove: {
                move: (
                  G: SetupState,
                  ctx: {
                    currentPlayer: string;
                    random: { Die: (n: number) => number; D6: () => number };
                  },
                  targetLayer: number,
                ) => {
                  if (ctx.currentPlayer !== G.dreamMasterID) return INVALID_MOVE;
                  if (!isAdjacent(G.players[ctx.currentPlayer]!.currentLayer, targetLayer)) {
                    return INVALID_MOVE;
                  }
                  return incrementMoveCounter(movePlayerToLayer(G, ctx.currentPlayer, targetLayer));
                },
                client: false,
              },
            },
          },
          discard: {
            moves: {
              // 弃牌
              doDiscard: {
                move: (
                  G: SetupState,
                  ctx: {
                    currentPlayer: string;
                    random: { Die: (n: number) => number; D6: () => number };
                  },
                  cardIds: CardID[],
                ) => {
                  return discardToLimit(G, ctx.currentPlayer as string, cardIds);
                },
                client: false,
              },
              // 不需要弃牌
              skipDiscard: {
                move: (G: SetupState) => G,
                client: false,
              },
            },
          },
          respondWindow: {
            moves: {
              // 响应取消解封
              respondCancelUnlock: {
                move: (G: SetupState) => G,
                client: false,
              },
              // 不响应
              passResponse: {
                move: (G: SetupState) => G,
                client: false,
              },
            },
          },
        },
      },
    },

    endgame: {
      next: null,
    },
  },

  // 游戏结束条件
  endIf: (G: SetupState) => {
    // 秘密金库被打开 → 盗梦者胜
    const secretVault = G.vaults.find((v) => v.contentType === 'secret');
    if (secretVault?.isOpened) {
      return { winner: 'thief' as Faction, reason: 'secret_vault_opened' };
    }

    // 所有金库被打开（无秘密金库被打开的情况不可能发生，因为秘密先开才赢）
    // 梦主获胜条件：所有盗梦者死亡或手牌无法再赢
    const aliveThieves = G.playerOrder.filter(
      (id) => G.players[id]?.faction === 'thief' && G.players[id]?.isAlive,
    );
    if (aliveThieves.length === 0) {
      return { winner: 'master' as Faction, reason: 'all_thieves_dead' };
    }

    return undefined;
  },
};

function isAdjacent(from: number, to: number): boolean {
  return Math.abs(from - to) === 1 && from >= 1 && from <= 4 && to >= 1 && to <= 4;
}
