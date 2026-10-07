// BGIO Game 对象 - 盗梦都市主游戏定义
//
// 本文件只做装配：把建局、各阶段的 move、回合钩子、终局判定、视图与事件描述接成一个对局定义。
// 具体逻辑分布：
//   建局参数与初始状态     matchSetup.ts
//   回合顺序与回合钩子     turnHooks.ts
//   终局判定               endCondition.ts
//   move（按主题分模块）   moves/，共用的类型与守卫见 moves/common.ts
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

import { MATCH_MAX_PLAYERS, MATCH_MIN_PLAYERS } from '@icgame/shared';
import { denyAction } from './engine/actionRights.js';
import { viewFor } from './engine/matchView.js';
import { describeMatchEvents } from './engine/matchEvents.js';
import { matchOutcome } from './engine/outcome.js';
import { recordPlayedCards } from './engine/recordPlayedCards.js';
import { withSettleGate } from './engine/settleGate.js';
import { matchEndIf } from './endCondition.js';
import { setupMatch } from './matchSetup.js';
import { migrateGameState } from './migrations.js';
import { actionCardMoves } from './moves/actionCards.js';
import { masterMoves } from './moves/master.js';
import { masterSkillMoves } from './moves/masterSkills.js';
import { peekMoves } from './moves/peek.js';
import { responseMoves } from './moves/responses.js';
import { setupPhaseMoves } from './moves/setupPhase.js';
import { shootMoves } from './moves/shoot.js';
import { thiefAttackSkillMoves } from './moves/thiefSkillsAttack.js';
import { thiefBoardSkillMoves } from './moves/thiefSkillsBoard.js';
import { thiefCardSkillMoves } from './moves/thiefSkillsCards.js';
import { turnFlowMoves } from './moves/turnFlow.js';
import { unlockMoves } from './moves/unlock.js';
import { playingTurn } from './turnHooks.js';
import type { SetupState } from './setup.js';
import type { GameDef } from './runner/matchRunner.js';

export type { SetupState } from './setup.js';
export { computeShootMoveChoices } from './moves/shootResolution.js';

export const InceptionCityGame = {
  name: 'inception-city',
  minPlayers: MATCH_MIN_PLAYERS,
  maxPlayers: MATCH_MAX_PLAYERS,
  disableUndo: true,

  setup: setupMatch,

  phases: {
    setup: {
      start: true,
      moves: setupPhaseMoves,
      next: 'playing',
      endIf: ({ G }: { G: SetupState }) => G.phase === 'playing',
    },

    playing: {
      turn: playingTurn,
      // 所有 move 扁平化（不用 BGIO stages）；出牌 move 统一记录打出的牌，再统一套上待结算闸门
      moves: withSettleGate(
        recordPlayedCards({
          ...turnFlowMoves,
          ...shootMoves,
          ...unlockMoves,
          ...actionCardMoves,
          ...peekMoves,
          ...masterMoves,
          ...masterSkillMoves,
          ...thiefAttackSkillMoves,
          ...thiefBoardSkillMoves,
          ...thiefCardSkillMoves,
          ...responseMoves,
        }),
      ),
    },

    endgame: {
      next: null,
    },
  },

  // 游戏结束条件
  endIf: matchEndIf,

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
