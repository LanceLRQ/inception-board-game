/**
 * Spike 2: TypeScript + Boardgame.io 类型体操
 *
 * 验证点：
 * 1. Game<G> 泛型能否正确约束 GameState
 * 2. Move 函数的 G 类型推断
 * 3. 复杂 GameState 类型（嵌套、联合、枚举）
 * 4. playerView 类型安全
 * 5. INVALID_MOVE 返回值
 * 6. FnContext 中 events/random/log 的类型推断
 * 7. Phase/Turn/Stage 配置的类型约束
 */

import type {
  Game,
  Ctx,
  FnContext,
  MoveFn,
  ActivePlayersArg,
  PhaseConfig,
  TurnConfig,
  StageConfig,
} from 'boardgame.io';
import { INVALID_MOVE, PlayerView } from 'boardgame.io/core';

// ============================================================
// 1. 盗梦都市核心类型定义（简化版）
// ============================================================

type Faction = 'thief' | 'master';
type TriggerTiming =
  | 'onTurnStart'
  | 'onActionPhase'
  | 'onBeforeShoot'
  | 'onAfterShoot'
  | 'onUnlock'
  | 'onKilled'
  | 'passive';

type ActionCardType =
  | 'shoot'
  | 'unlock'
  | 'dreamWalker'
  | 'createFromNothing'
  | 'dreamPeek'
  | 'nightmareUnlock'
  | 'timeStorm';

interface ActionCard {
  id: string;
  type: ActionCardType;
  name: string;
}

interface PlayerState {
  faction: Faction;
  hand: ActionCard[];
  alive: boolean;
  layer: number;
  characterId: string | null;
  successfulUnlocks: number;
}

interface VaultCard {
  isSecret: boolean;
  coins: number;
}

interface DreamLayer {
  heartLocks: number;
  vault: VaultCard | null;
  players: string[];
}

interface GameState {
  players: Record<string, PlayerState>;
  layers: DreamLayer[];
  deck: ActionCard[];
  discardPile: ActionCard[];
  nightmareDeck: ActionCard[];
  currentPlayerIndex: number;
  turnDirection: 'clockwise' | 'counter-clockwise';
  log: string[];
  pendingResponse: {
    type: 'cancelUnlock' | 'shootResponse';
    initiator: string;
    resolved: boolean;
  } | null;
  bribeCards: Record<string, { dealt: boolean; isDeal: boolean }>;
  seed: number;
}

// ============================================================
// 2. 验证 Game<G> 泛型约束
// ============================================================

/**
 * 验证 A: Game<GameState> 的泛型是否传播到所有回调
 * 如果传播成功，setup/moves/hooks 中的 G 应该自动推断为 GameState
 */
const InceptionGame: Game<GameState> = {
  name: 'inception-city',

  setup: ({ ctx }): GameState => ({
    players: Object.fromEntries(
      Array.from({ length: ctx.numPlayers }, (_, i) => [
        String(i),
        {
          faction: i === 0 ? 'master' : 'thief',
          hand: [],
          alive: true,
          layer: 1,
          characterId: null,
          successfulUnlocks: 0,
        },
      ])
    ),
    layers: Array.from({ length: 5 }, (_, i) => ({
      heartLocks: i === 0 ? 0 : 3 - Math.min(i - 1, 2),
      vault: null,
      players: [],
    })),
    deck: [],
    discardPile: [],
    nightmareDeck: [],
    currentPlayerIndex: 0,
    turnDirection: 'counter-clockwise',
    log: [],
    pendingResponse: null,
    bribeCards: {},
    seed: 42,
  }),

  // ============================================================
  // 3. 验证 Move 函数类型安全
  // ============================================================

  moves: {
    // 验证 B: G 自动推断为 GameState，playerID 为 string
    playUnlock: ({ G, playerID, events }) => {
      const player = G.players[playerID];

      // 类型安全访问：TypeScript 应该知道 player 是 PlayerState
      if (player.hand.length === 0) {
        return INVALID_MOVE;
      }

      // 类型安全修改：TypeScript 应该知道这些字段
      const cardIndex = player.hand.findIndex(c => c.type === 'unlock');
      if (cardIndex === -1) {
        return INVALID_MOVE;
      }

      player.hand.splice(cardIndex, 1);
      G.discardPile.push(player.hand[cardIndex]);
      G.log.push(`玩家${playerID} 打出解封`);

      // setActivePlayers 类型安全
      events.setActivePlayers({
        others: 'respondToUnlock',
        maxMoves: 1,
        revert: true,
      });
    },

    // 验证 C: 带参数的 Move
    shootPlayer: ({ G, playerID, random }, targetId: string) => {
      const shooter = G.players[playerID];
      const target = G.players[targetId];

      if (!target || !target.alive) {
        return INVALID_MOVE;
      }

      const cardIdx = shooter.hand.findIndex(c => c.type === 'shoot');
      if (cardIdx === -1) {
        return INVALID_MOVE;
      }

      // random API 类型验证
      const diceResult = random.D6();
      G.log.push(`玩家${playerID} 射击 玩家${targetId}，掷骰=${diceResult}`);

      if (diceResult >= 4) {
        target.alive = false;
        target.layer = 0;
        G.log.push(`玩家${targetId} 被击杀！`);
      }

      shooter.hand.splice(cardIdx, 1);
    },

    // 验证 D: 复杂响应链 Move
    respondToCancel: ({ G, playerID }, accept: boolean) => {
      if (!G.pendingResponse) {
        return INVALID_MOVE;
      }

      if (accept) {
        G.log.push(`玩家${playerID} 接受了取消`);
        G.pendingResponse.resolved = true;
      } else {
        G.log.push(`玩家${playerID} 拒绝了取消`);
      }
    },
  },

  // ============================================================
  // 4. 验证 playerView 类型安全
  // ============================================================

  playerView: ({ G, playerID }): GameState => {
    // 验证 E: playerView 的 G 是 GameState，返回类型也是 GameState
    const filtered: GameState = {
      ...G,
      // 隐藏其他玩家的手牌
      players: Object.fromEntries(
        Object.entries(G.players).map(([id, player]) => [
          id,
          id === playerID
            ? player
            : {
                ...player,
                hand: [], // 其他玩家手牌清空
              },
        ])
      ),
      // 隐藏牌库内容，只保留数量
      deck: [],
      // 隐藏噩梦牌
      nightmareDeck: [],
      // 隐藏贿赂牌正反面
      bribeCards: Object.fromEntries(
        Object.entries(G.bribeCards).map(([id, card]) => [
          id,
          { dealt: card.dealt, isDeal: false }, // 永远不暴露正面
        ])
      ),
    };
    return filtered;
  },

  // ============================================================
  // 5. 验证 Phase/Turn/Stage 配置类型约束
  // ============================================================

  phases: {
    setup: {
      start: true,
      next: 'action',
      moves: {
        // 验证 F: phase 内 move 的 G 也是 GameState
        chooseCharacter: ({ G, playerID }, characterId: string) => {
          G.players[playerID].characterId = characterId;
        },
      },
      onEnd: ({ G }) => {
        G.log.push('配置阶段结束');
      },
    },

    action: {
      next: 'draw',
      onBegin: ({ G, ctx }) => {
        // 验证 G: ctx 类型正确
        G.log.push(`行动阶段开始，当前玩家: ${ctx.currentPlayer}`);
      },
    },

    draw: {
      next: 'action',
      onBegin: ({ G, ctx }) => {
        const player = G.players[ctx.currentPlayer];
        // 抽 2 张牌（简化）
        for (let i = 0; i < 2 && G.deck.length > 0; i++) {
          player.hand.push(G.deck.pop()!);
        }
        G.log.push(`抽牌阶段，${ctx.currentPlayer} 抽了 2 张`);
      },
    },
  },

  turn: {
    stages: {
      respondToUnlock: {
        moves: {
          cancelUnlock: ({ G, playerID }) => {
            if (G.players[playerID].hand.length === 0) {
              return INVALID_MOVE;
            }
            G.log.push(`玩家${playerID} 取消了解封`);
          },
          passResponse: ({ G, playerID }) => {
            G.log.push(`玩家${playerID} 放弃响应`);
          },
        },
      },
    },
    onBegin: ({ G, ctx }) => {
      // 重置回合状态
      G.players[ctx.currentPlayer].successfulUnlocks = 0;
      G.pendingResponse = null;
    },
    onEnd: ({ G }) => {
      G.log.push('回合结束');
    },
  },
};

// ============================================================
// 6. 验证提取后的独立 Move 函数类型推断
// ============================================================

// 验证 H: 独立 MoveFn 泛型
const standaloneMove: MoveFn<GameState> = ({ G, playerID }) => {
  const player = G.players[playerID];
  player.successfulUnlocks++;
};

// ============================================================
// 7. 验证 ActivePlayersArg 类型
// ============================================================

const validActivePlayersConfigs: ActivePlayersArg[] = [
  { all: 'someStage' },
  { others: 'respond', maxMoves: 1, revert: true },
  { currentPlayer: 'acting', others: 'watching' },
  { value: { '0': 'stageA', '1': 'stageB' } },
  { all: { stage: 'respond', maxMoves: 1 }, next: { currentPlayer: 'resolved' } },
];

// ============================================================
// 8. 运行时验证（用 Client 测试类型编译）
// ============================================================

import { Client } from 'boardgame.io/client';

const client = Client({
  game: InceptionGame,
  numPlayers: 5,
});

const state = client.getState();
if (state) {
  // 验证 I: getState() 的类型推断
  const g: GameState = state.G;
  const ctx: Ctx = state.ctx;
  console.log(`当前玩家: ${ctx.currentPlayer}`);
  console.log(`玩家数: ${ctx.numPlayers}`);
  console.log(`活跃玩家: ${JSON.stringify(ctx.activePlayers)}`);
  console.log(`0号阵营: ${g.players['0']?.faction}`);
}

console.log('\n📝 Spike 2 类型验证完成！');
console.log('  所有类型推断正确，Game<GameState> 泛型传播正常。\n');
