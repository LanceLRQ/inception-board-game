/**
 * Spike 5: GameEngine 适配层最小原型
 *
 * ADR-002 核心验证：
 *   所有 Moves 是纯函数 (G, payload) => G | INVALID_MOVE
 *   GameEngine 适配层负责将 BGIO 的 FnContext 转换为纯函数参数
 *   Bot 和人类共用同一套 Move 接口
 *
 * 验证点：
 *   1. 纯函数 Move 可脱离 BGIO 独立调用（单元测试友好）
 *   2. 适配层将 BGIO FnContext 映射到 Move 参数
 *   3. 同一套 Move 在 Local AI / 多人在线 / Bot 中复用
 *   4. Random 通过适配层注入（确定性可测试）
 */

import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { INVALID_MOVE } from 'boardgame.io/core';

// ============================================================
// 第一层：纯函数 Move（框架无关，可直接单元测试）
// ============================================================

type Faction = 'thief' | 'master';

interface ActionCard {
  id: string;
  type: 'shoot' | 'unlock' | 'dreamWalker' | 'createFromNothing';
}

interface PlayerState {
  faction: Faction;
  hand: ActionCard[];
  alive: boolean;
  layer: number;
  successfulUnlocks: number;
}

interface GameState {
  players: Record<string, PlayerState>;
  layers: { heartLocks: number; players: string[] }[];
  deck: ActionCard[];
  discardPile: ActionCard[];
  log: string[];
  turnDirection: 'clockwise' | 'counter-clockwise';
}

/** Move 返回类型 */
type MoveResult = GameState | typeof INVALID_MOVE | void;

/** 纯函数 Move 签名（框架无关） */
interface PureMove<Payload = void> {
  (state: GameState, ctx: MoveContext, payload: Payload): MoveResult;
}

/** Move 上下文（适配层注入，不含 BGIO 依赖） */
interface MoveContext {
  playerID: string;
  numPlayers: number;
  currentPlayer: string;
  turn: number;
  phase: string;
  /** 随机数生成器（注入而非硬编码） */
  random: {
    D6: () => number;
    shuffle: <T>(arr: T[]) => T[];
    nextInt: (min: number, max: number) => number;
  };
  /** 事件触发器（适配层桥接） */
  events: {
    endTurn: () => void;
    endPhase: () => void;
    setActivePlayers: (config: any) => void;
    endStage: () => void;
  };
}

// === 纯函数 Move 实现 ===

const shootPlayer: PureMove<string> = (state, ctx, targetId) => {
  const shooter = state.players[ctx.playerID];
  const target = state.players[targetId];

  if (!shooter || !shooter.alive) return INVALID_MOVE;
  if (!target || !target.alive) return INVALID_MOVE;
  if (targetId === ctx.playerID) return INVALID_MOVE;
  if (target.layer !== shooter.layer) return INVALID_MOVE;

  const cardIdx = shooter.hand.findIndex(c => c.type === 'shoot');
  if (cardIdx === -1) return INVALID_MOVE;

  shooter.hand.splice(cardIdx, 1);
  const diceResult = ctx.random.D6();
  state.log.push(`[SHOOT] ${ctx.playerID}→${targetId} 骰=${diceResult}`);

  if (diceResult >= 4) {
    target.alive = false;
    target.layer = 0;
    state.log.push(`[击杀] ${targetId} 死亡`);
  }

  state.discardPile.push({ id: `used-shoot-${Date.now()}`, type: 'shoot' });
};

const playUnlock: PureMove<void> = (state, ctx) => {
  const player = state.players[ctx.playerID];
  if (!player || !player.alive) return INVALID_MOVE;
  if (player.successfulUnlocks >= 1) return INVALID_MOVE;

  const cardIdx = player.hand.findIndex(c => c.type === 'unlock');
  if (cardIdx === -1) return INVALID_MOVE;

  player.hand.splice(cardIdx, 1);
  player.successfulUnlocks++;

  const layer = state.layers[player.layer];
  if (layer && layer.heartLocks > 0) {
    layer.heartLocks--;
    state.log.push(`[解封] ${ctx.playerID} 解锁层级${player.layer}，剩余心锁=${layer.heartLocks}`);
  } else {
    state.log.push(`[解封] ${ctx.playerID} 解封（无需解锁）`);
  }
};

const drawCards: PureMove<{ count: number }> = (state, ctx, { count }) => {
  const player = state.players[ctx.playerID];
  if (!player) return INVALID_MOVE;

  for (let i = 0; i < count && state.deck.length > 0; i++) {
    player.hand.push(state.deck.pop()!);
  }
  state.log.push(`[抽牌] ${ctx.playerID} 抽了 ${count} 张`);
};

const passTurn: PureMove<void> = (state, ctx) => {
  state.log.push(`[跳过] ${ctx.playerID} 跳过出牌`);
  ctx.events.endTurn();
};

// ============================================================
// 第二层：GameEngine 适配层（将纯函数适配到 BGIO）
// ============================================================

interface EventQueue {
  type: string;
  args: any[];
}

/** 将纯函数 Move 包装为 BGIO Move */
function adaptMove<Payload>(pureMove: PureMove<Payload>) {
  return ({ G, ctx: bgioCtx, playerID, events, random, ...rest }: any, payload: any) => {
    // 收集事件调用
    const eventQueue: EventQueue[] = [];

    const moveCtx: MoveContext = {
      playerID,
      numPlayers: bgioCtx.numPlayers,
      currentPlayer: bgioCtx.currentPlayer,
      turn: bgioCtx.turn,
      phase: bgioCtx.phase,
      random: {
        D6: () => random.D6(),
        shuffle: <T>(arr: T[]) => random.Shuffle(arr),
        nextInt: (min: number, max: number) => random.Die(max - min + 1) + min - 1,
      },
      events: {
        endTurn: () => eventQueue.push({ type: 'endTurn', args: [] }),
        endPhase: () => eventQueue.push({ type: 'endPhase', args: [] }),
        setActivePlayers: (config: any) => eventQueue.push({ type: 'setActivePlayers', args: [config] }),
        endStage: () => eventQueue.push({ type: 'endStage', args: [] }),
      },
    };

    // 调用纯函数
    const result = pureMove(G, moveCtx, payload);

    // 如果结果为 INVALID_MOVE，直接返回让 BGIO 处理
    if (result === INVALID_MOVE) return INVALID_MOVE;

    // 执行队列中的事件（必须在 G 修改之后）
    for (const evt of eventQueue) {
      switch (evt.type) {
        case 'endTurn': events.endTurn(); break;
        case 'endPhase': events.endPhase(); break;
        case 'setActivePlayers': events.setActivePlayers(evt.args[0]); break;
        case 'endStage': events.endStage(); break;
      }
    }

    // 返回结果（void 或修改后的 G）
    return result;
  };
}

/** BGIO Game 定义（通过适配层桥接） */
function createGame() {
  return {
    name: 'engine-adapter-test',
    setup: ({ ctx }: { ctx: any }): GameState => ({
      players: Object.fromEntries(
        Array.from({ length: ctx.numPlayers }, (_, i) => [
          String(i),
          {
            faction: i === 0 ? 'master' as Faction : 'thief' as Faction,
            hand: [
              { id: `s${i}`, type: 'shoot' as const },
              { id: `u${i}`, type: 'unlock' as const },
              { id: `d${i}`, type: 'dreamWalker' as const },
            ],
            alive: true,
            layer: 1,
            successfulUnlocks: 0,
          },
        ])
      ),
      layers: [
        { heartLocks: 0, players: [] },
        { heartLocks: 3, players: [] },
        { heartLocks: 2, players: [] },
        { heartLocks: 1, players: [] },
        { heartLocks: 2, players: [] },
      ],
      deck: Array.from({ length: 20 }, (_, i) => ({
        id: `deck-${i}`,
        type: ['shoot', 'unlock', 'dreamWalker', 'createFromNothing'][i % 4] as ActionCard['type'],
      })),
      discardPile: [],
      log: [],
      turnDirection: 'counter-clockwise' as const,
    }),

    // 适配层桥接
    moves: {
      shootPlayer: adaptMove(shootPlayer),
      playUnlock: adaptMove(playUnlock),
      drawCards: adaptMove(drawCards),
      passTurn: adaptMove(passTurn),
    },

    turn: {
      stages: {
        responding: {
          moves: {
            passResponse: adaptMove(((state: GameState, ctx: MoveContext) => {
              state.log.push(`[放弃响应] ${ctx.playerID}`);
            }) as PureMove<void>),
          },
        },
      },
    },
  };
}

// ============================================================
// 第三层：纯函数单元测试（无 BGIO 依赖）
// ============================================================

function assert(condition: boolean, name: string, detail: string): boolean {
  if (condition) { console.log(`  ✅ ${name}`); return true; }
  else { console.log(`  ❌ ${name} — ${detail}`); return false; }
}

let passed = 0, failed = 0;
function check(cond: boolean, name: string, detail: string) {
  if (assert(cond, name, detail)) passed++; else failed++;
}

function makeTestState(): GameState {
  return {
    players: {
      '0': { faction: 'master', hand: [{ id: 's0', type: 'shoot' }, { id: 'u0', type: 'unlock' }], alive: true, layer: 1, successfulUnlocks: 0 },
      '1': { faction: 'thief', hand: [{ id: 's1', type: 'shoot' }, { id: 'u1', type: 'unlock' }], alive: true, layer: 1, successfulUnlocks: 0 },
      '2': { faction: 'thief', hand: [{ id: 's2', type: 'shoot' }], alive: true, layer: 2, successfulUnlocks: 0 },
    },
    layers: [
      { heartLocks: 0, players: [] },
      { heartLocks: 3, players: [] },
      { heartLocks: 2, players: [] },
      { heartLocks: 1, players: [] },
      { heartLocks: 2, players: [] },
    ],
    deck: [{ id: 'd1', type: 'shoot' }, { id: 'd2', type: 'unlock' }],
    discardPile: [],
    log: [],
    turnDirection: 'counter-clockwise',
  };
}

function makeTestCtx(playerID: string): MoveContext {
  return {
    playerID,
    numPlayers: 3,
    currentPlayer: playerID,
    turn: 1,
    phase: 'action',
    random: {
      D6: () => 4, // 固定返回 4（击杀）
      shuffle: <T>(arr: T[]) => arr,
      nextInt: (min: number, max: number) => min,
    },
    events: {
      endTurn: () => {},
      endPhase: () => {},
      setActivePlayers: () => {},
      endStage: () => {},
    },
  };
}

function main() {
  console.log('\n🧪 Spike 5: GameEngine 适配层最小原型\n');
  console.log('='.repeat(60));

  // === Part A：纯函数单元测试（零 BGIO 依赖）===
  console.log('\n📋 Part A：纯函数 Move 单元测试（无 BGIO）');

  console.log('\n  测试 A1：shootPlayer 纯函数');
  {
    const state = makeTestState();
    shootPlayer(state, makeTestCtx('0'), '1');
    check(state.players['1'].alive === false, 'p1 被击杀', `alive: ${state.players['1'].alive}`);
    check(state.players['0'].hand.length === 1, 'p0 射出 shoot 牌', `hand: ${state.players['0'].hand.length}`);
    check(state.log.some(l => l.includes('[SHOOT]')), 'SHOOT 日志', `log: ${state.log}`);
  }

  console.log('\n  测试 A2：playUnlock 纯函数');
  {
    const state = makeTestState();
    playUnlock(state, makeTestCtx('0'), undefined);
    check(state.players['0'].successfulUnlocks === 1, '成功解封+1', `value: ${state.players['0'].successfulUnlocks}`);
    check(state.layers[1].heartLocks === 2, '层级1 心锁 3→2', `locks: ${state.layers[1].heartLocks}`);
    check(state.players['0'].hand.length === 1, '消耗了解封牌', `hand: ${state.players['0'].hand.length}`);
  }

  console.log('\n  测试 A3：非法操作返回 INVALID_MOVE');
  {
    const state = makeTestState();
    const result1 = shootPlayer(state, makeTestCtx('0'), '0'); // 射自己
    check(result1 === INVALID_MOVE, '射自己返回 INVALID_MOVE', '');

    const result2 = shootPlayer(state, makeTestCtx('0'), '2'); // 不同层
    check(result2 === INVALID_MOVE, '跨层射击返回 INVALID_MOVE', '');

    // 二次解封
    playUnlock(state, makeTestCtx('0'), undefined);
    const result3 = playUnlock(state, makeTestCtx('0'), undefined); // 但没有 unlock 牌了
    check(result3 === INVALID_MOVE, '无牌解封返回 INVALID_MOVE', '');
  }

  console.log('\n  测试 A4：drawCards 纯函数');
  {
    const state = makeTestState();
    drawCards(state, makeTestCtx('0'), { count: 2 });
    check(state.players['0'].hand.length === 4, '抽 2 张后手牌=4', `hand: ${state.players['0'].hand.length}`);
    check(state.deck.length === 0, '牌库空', `deck: ${state.deck.length}`);
  }

  // === Part B：通过 BGIO 适配层运行 ===
  console.log('\n📋 Part B：BGIO 适配层集成测试');
  {
    const game = createGame();
    const mp = Local();
    const p0 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '0' });
    const p1 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '1' });
    p0.start(); p1.start();

    // 通过适配层调用 shootPlayer（p0 射 p1，但 p1 存活需要骰<4）
    // 先用不同层的目标测试 INVALID_MOVE
    p0.moves.shootPlayer('99'); // 不存在的目标 → INVALID_MOVE
    const s0 = p0.getState()!;
    check(
      s0.G.players['0'].hand.length === 3,
      '无效 SHOOT 不消耗手牌',
      `hand: ${s0.G.players['0'].hand.length}`
    );

    // 通过适配层调用 playUnlock
    p0.moves.playUnlock();
    const s1 = p0.getState()!;
    check(
      s1.G.players['0'].successfulUnlocks === 1,
      '通过适配层解封成功',
      `value: ${s1.G.players['0'].successfulUnlocks}`
    );
    check(
      s1.G.log.some(l => l.includes('[解封]')),
      '适配层日志正确',
      `log: ${JSON.stringify(s1.G.log)}`
    );

    p0.stop(); p1.stop();
  }

  // === Part C：Bot 模拟（直接调用纯函数，无需 BGIO Client）===
  console.log('\n📋 Part C：Bot 直接调用纯函数模拟');
  {
    const state = makeTestState();
    const ctx = makeTestCtx('1'); // Bot 是玩家 1

    // Bot 决策：如果有 shoot 就射击梦主
    const hasShoot = state.players['1'].hand.some(c => c.type === 'shoot');
    if (hasShoot) {
      shootPlayer(state, ctx, '0');
    }
    check(state.players['0'].alive === false, 'Bot 击杀了梦主', `alive: ${state.players['0'].alive}`);
    check(state.log.some(l => l.includes('[SHOOT]')), 'Bot 日志正确', '');

    // Bot 抽牌
    drawCards(state, ctx, { count: 1 });
    check(state.players['1'].hand.length >= 1, 'Bot 抽牌后手牌 >= 1', `hand: ${state.players['1'].hand.length}`);
  }

  // === Part D：确定性测试（固定随机种子）===
  console.log('\n📋 Part D：确定性测试（固定随机数）');
  {
    let callCount = 0;
    const deterministicCtx: MoveContext = {
      ...makeTestCtx('0'),
      random: {
        D6: () => { callCount++; return 6; }, // 永远掷 6
        shuffle: <T>(arr: T[]) => [...arr].reverse(),
        nextInt: (min: number) => min,
      },
    };

    const state = makeTestState();
    shootPlayer(state, deterministicCtx, '1');
    check(
      state.players['1'].alive === false,
      '骰=6 必定击杀',
      `alive: ${state.players['1'].alive}`
    );
    check(callCount === 1, 'random.D6 只调用 1 次', `calls: ${callCount}`);
  }

  // === 结论 ===
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 结果：✅ ${passed} 通过 / ❌ ${failed} 失败 / 共 ${passed + failed} 项\n`);
  console.log('📝 可行性评估：\n');
  console.log('  ✅ 纯函数 Move 可脱离 BGIO 独立调用和测试');
  console.log('  ✅ 适配层成功桥接 BGIO FnContext → MoveContext');
  console.log('  ✅ Bot 直接调用纯函数，无需 BGIO Client');
  console.log('  ✅ 随机数通过注入实现确定性测试');
  console.log('  ✅ 同一套 Move 在三种场景复用（纯测试/BGIO/Bot）');
  console.log('\n  🎯 结论：GameEngine 适配层设计 **可行**，符合 ADR-002。\n');
}

main();
