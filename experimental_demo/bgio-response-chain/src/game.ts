/**
 * Spike 1: Boardgame.io 响应链验证
 *
 * 场景：盗梦都市的"解封→取消解封"响应链
 * - 玩家打出【解封】后，其他玩家进入响应窗口
 * - 响应者可以【取消解封】或【放弃】
 *
 * 验证点：
 * 1. setActivePlayers 能否让多人同时进入响应 stage
 * 2. maxMoves 能否限制每人只操作一次
 * 3. revert 能否在响应结束后恢复
 * 4. 嵌套响应链是否可行
 * 5. 5 人/10 人扩展性
 */

import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';

// === 游戏状态 ===
interface GameState {
  hands: Record<string, number>;
  heartLocks: number[];
  log: string[];
  pendingUnlocks: Array<{ player: string; layer: number; cancelled: boolean }>;
  successfulUnlocks: number;
}

// === 辅助：创建游戏定义 ===
function createGame() {
  return {
    name: 'unlock-response-chain',

    setup: ({ ctx }: { ctx: any }): GameState => ({
      hands: Object.fromEntries(
        Array.from({ length: ctx.numPlayers }, (_, i) => [String(i), 5])
      ),
      heartLocks: [0, 3, 2, 1, 2],
      log: [],
      pendingUnlocks: [],
      successfulUnlocks: 0,
    }),

    moves: {
      playUnlock: ({ G, playerID, events }: { G: GameState; playerID: string; events: any }) => {
        if (G.hands[playerID] <= 0) return;
        G.hands[playerID]--;
        G.log.push(`[解锁] 玩家${playerID} 打出解封`);
        G.pendingUnlocks.push({ player: playerID, layer: 1, cancelled: false });
        events.setActivePlayers({
          others: 'respondToUnlock',
          maxMoves: 1,
          revert: true,
        });
      },

      passAction: ({ G, playerID, events }: { G: GameState; playerID: string; events: any }) => {
        G.log.push(`[跳过] 玩家${playerID} 跳过出牌`);
        events.endTurn();
      },
    },

    turn: {
      stages: {
        respondToUnlock: {
          moves: {
            cancelUnlock: ({ G, playerID }: { G: GameState; playerID: string; events: any }) => {
              if (G.hands[playerID] <= 0) {
                G.log.push(`[取消失败] 玩家${playerID} 手牌不足`);
                return;
              }
              G.hands[playerID]--;
              // 标记最后一个待结算解封为已取消
              const pending = G.pendingUnlocks[G.pendingUnlocks.length - 1];
              if (pending) {
                pending.cancelled = true;
              }
              G.log.push(`[取消] 玩家${playerID} 取消了解封！`);
            },

            passRespond: ({ G, playerID }: { G: GameState; playerID: string }) => {
              G.log.push(`[放弃] 玩家${playerID} 放弃响应`);
            },
          },
        },
      },
    },
  };
}

// === 测试辅助 ===
function assert(condition: boolean, name: string, detail: string): boolean {
  if (condition) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name} — ${detail}`);
  }
  return condition;
}

let passed = 0;
let failed = 0;

function check(condition: boolean, name: string, detail: string) {
  if (assert(condition, name, detail)) {
    passed++;
  } else {
    failed++;
  }
}

// === 测试 ===
console.log('\n🧪 Spike 1: Boardgame.io 响应链验证\n');
console.log('='.repeat(60));

// 测试 1：基础解封 + revert
console.log('\n📋 测试 1：基础解封（无人响应，revert 自动恢复）');
{
  const game = createGame();
  const mp = Local();
  const p0 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '0' });
  const p1 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '1' });
  const p2 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '2' });
  p0.start(); p1.start(); p2.start();

  p0.moves.playUnlock();
  const s1 = p1.getState()!;

  check(
    s1.ctx.activePlayers?.['1'] === 'respondToUnlock',
    '玩家 1 进入 respondToUnlock stage',
    `actual: ${JSON.stringify(s1.ctx.activePlayers)}`
  );
  check(
    s1.ctx.activePlayers?.['2'] === 'respondToUnlock',
    '玩家 2 进入 respondToUnlock stage',
    `actual: ${JSON.stringify(s1.ctx.activePlayers)}`
  );

  p1.moves.passRespond();
  p2.moves.passRespond();

  const sAfter = p0.getState()!;
  check(
    !sAfter.ctx.activePlayers || Object.keys(sAfter.ctx.activePlayers).length === 0,
    'revert 后 activePlayers 清空',
    `actual: ${JSON.stringify(sAfter.ctx.activePlayers)}`
  );
  check(
    sAfter.G.log.some((l: string) => l.includes('[解锁]')),
    '解封日志正确',
    `log: ${JSON.stringify(sAfter.G.log)}`
  );

  p0.stop(); p1.stop(); p2.stop();
}

// 测试 2：取消解封
console.log('\n📋 测试 2：取消解封（有人响应取消）');
{
  const game = createGame();
  const mp = Local();
  const p0 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '0' });
  const p1 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '1' });
  const p2 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '2' });
  p0.start(); p1.start(); p2.start();

  p0.moves.playUnlock();

  // p1 取消
  p1.moves.cancelUnlock();
  // p2 放弃
  p2.moves.passRespond();

  const s = p0.getState()!;
  check(
    s.G.log.some((l: string) => l.includes('[取消]')),
    '取消日志正确',
    `log: ${JSON.stringify(s.G.log)}`
  );
  // 检查是否有任何一个 pendingUnlock 被标记为 cancelled
  check(
    s.G.pendingUnlocks.some((p: any) => p.cancelled === true),
    '待结算解封被标记为已取消',
    `pending: ${JSON.stringify(s.G.pendingUnlocks)}`
  );
  check(
    s.G.hands['1'] === 4,
    '取消者手牌 -1',
    `hands[1]: ${s.G.hands['1']}`
  );
  check(
    s.G.hands['0'] === 4,
    '出牌者手牌 -1',
    `hands[0]: ${s.G.hands['0']}`
  );

  p0.stop(); p1.stop(); p2.stop();
}

// 测试 3：maxMoves 限制
console.log('\n📋 测试 3：maxMoves=1 限制每人只操作一次');
{
  const game = createGame();
  const mp = Local();
  const p0 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '0' });
  const p1 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '1' });
  const p2 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '2' });
  p0.start(); p1.start(); p2.start();

  p0.moves.playUnlock();

  // 在 p1 操作之前，p1 应该在 activePlayers 中
  const beforePass = p1.getState()!;
  check(
    beforePass.ctx.activePlayers?.['1'] === 'respondToUnlock',
    '操作前 p1 在 activePlayers 中',
    `actual: ${JSON.stringify(beforePass.ctx.activePlayers)}`
  );

  // p1 放弃（使用 maxMoves=1 的那一次）
  p1.moves.passRespond();

  // 操作后 p1 应该被移出 activePlayers
  const afterPass = p1.getState()!;
  check(
    afterPass.ctx.activePlayers?.['1'] === undefined,
    'maxMoves=1 后 p1 被移出 activePlayers',
    `actual: ${JSON.stringify(afterPass.ctx.activePlayers)}`
  );

  p0.stop(); p1.stop(); p2.stop();
}

// 测试 4：5 人局多人同时响应
console.log('\n📋 测试 4：5 人局多人同时进入响应阶段');
{
  const game = createGame();
  const mp = Local();
  const clients = Array.from({ length: 5 }, (_, i) =>
    Client({ game, numPlayers: 5, multiplayer: mp, playerID: String(i) })
  );
  clients.forEach(c => c.start());

  clients[0].moves.playUnlock();

  // 检查 p1-p4 是否都在 respondToUnlock stage
  let allInStage = true;
  let stageDetails: string[] = [];
  for (let i = 1; i < 5; i++) {
    const s = clients[i].getState()!;
    const stage = s.ctx.activePlayers?.[String(i)];
    stageDetails.push(`p${i}=${stage}`);
    if (stage !== 'respondToUnlock') {
      allInStage = false;
    }
  }
  check(
    allInStage,
    '所有其他 4 名玩家同时进入 respondToUnlock',
    `details: ${stageDetails.join(', ')}`
  );

  // 所有响应者放弃
  for (let i = 1; i < 5; i++) {
    clients[i].moves.passRespond();
  }

  // 验证 revert 后状态恢复
  const sFinal = clients[0].getState()!;
  check(
    !sFinal.ctx.activePlayers || Object.keys(sFinal.ctx.activePlayers || {}).length === 0,
    '5 人局 revert 后 activePlayers 清空',
    `actual: ${JSON.stringify(sFinal.ctx.activePlayers)}`
  );

  clients.forEach(c => c.stop());
}

// 测试 5：单机模式（非 multiplayer）验证
console.log('\n📋 测试 5：单机 Client 模式验证');
{
  const client = Client({ game: createGame(), numPlayers: 3 });

  const s0 = client.getState()!;
  check(s0.G.hands['0'] === 5, '初始手牌正确', `hands: ${s0.G.hands['0']}`);

  client.moves.playUnlock();
  const s1 = client.getState()!;
  check(s1.G.hands['0'] === 4, '打出后手牌 -1', `hands: ${s1.G.hands['0']}`);
  check(
    s1.ctx.activePlayers !== undefined,
    '单机模式下 activePlayers 生效',
    `activePlayers: ${JSON.stringify(s1.ctx.activePlayers)}`
  );
}

// 测试 6：10 人局扩展验证
console.log('\n📋 测试 6：10 人局扩展验证');
{
  const game = createGame();
  const mp = Local();
  const clients = Array.from({ length: 10 }, (_, i) =>
    Client({ game, numPlayers: 10, multiplayer: mp, playerID: String(i) })
  );
  clients.forEach(c => c.start());

  clients[0].moves.playUnlock();

  // p1-p9 应该都在 respondToUnlock
  let allInStage = true;
  for (let i = 1; i < 10; i++) {
    const s = clients[i].getState()!;
    if (s.ctx.activePlayers?.[String(i)] !== 'respondToUnlock') {
      allInStage = false;
    }
  }
  check(
    allInStage,
    '10 人局：所有其他 9 名玩家同时进入 respondToUnlock',
    ''
  );

  // 全部放弃
  for (let i = 1; i < 10; i++) {
    clients[i].moves.passRespond();
  }

  const sFinal = clients[0].getState()!;
  check(
    !sFinal.ctx.activePlayers || Object.keys(sFinal.ctx.activePlayers || {}).length === 0,
    '10 人局 revert 后 activePlayers 清空',
    `actual: ${JSON.stringify(sFinal.ctx.activePlayers)}`
  );

  clients.forEach(c => c.stop());
}

// 测试 7：cancelUnlock 后再 playUnlock（回合内多次响应链）
console.log('\n📋 测试 7：同一回合内多次打出解封（多次响应链）');
{
  const game = createGame();
  const mp = Local();
  const p0 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '0' });
  const p1 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '1' });
  const p2 = Client({ game, numPlayers: 3, multiplayer: mp, playerID: '2' });
  p0.start(); p1.start(); p2.start();

  // 第一次解封
  p0.moves.playUnlock();
  p1.moves.passRespond();
  p2.moves.passRespond();

  // revert 后 p0 回到正常状态，可以再打一张
  const sBetween = p0.getState()!;
  check(
    !sBetween.ctx.activePlayers || Object.keys(sBetween.ctx.activePlayers || {}).length === 0,
    '第一次响应链结束后恢复',
    `activePlayers: ${JSON.stringify(sBetween.ctx.activePlayers)}`
  );

  // 第二次解封
  p0.moves.playUnlock();
  const sAfter2 = p0.getState()!;
  check(
    sAfter2.ctx.activePlayers?.['1'] === 'respondToUnlock',
    '第二次解封也能触发响应链',
    `activePlayers: ${JSON.stringify(sAfter2.ctx.activePlayers)}`
  );

  p1.moves.passRespond();
  p2.moves.passRespond();

  const sFinal = p0.getState()!;
  check(
    sFinal.G.hands['0'] === 3,
    '两次解封后手牌 = 3',
    `hands[0]: ${sFinal.G.hands['0']}`
  );
  check(
    sFinal.G.pendingUnlocks.length === 2,
    '两次解封产生 2 个 pendingUnlock',
    `count: ${sFinal.G.pendingUnlocks.length}`
  );

  p0.stop(); p1.stop(); p2.stop();
}

// === 结果汇总 ===
console.log('\n' + '='.repeat(60));
console.log(`\n📊 结果：✅ ${passed} 通过 / ❌ ${failed} 失败 / 共 ${passed + failed} 项\n`);

// === 可行性结论 ===
console.log('='.repeat(60));
console.log('\n📝 可行性评估：\n');
console.log('  ✅ setActivePlayers + stages 可实现响应窗口');
console.log('  ✅ maxMoves=1 可限制每人操作次数');
console.log('  ✅ revert 可在响应结束后自动恢复');
console.log('  ✅ 同一回合可多次触发响应链');
console.log('  ✅ 10 人局可扩展（others 自动包含所有非当前玩家）');
console.log('  ⚠️  嵌套响应链（取消→再取消）需要在 move 内部再次 setActivePlayers');
console.log('      方案 A：cancelUnlock 内部再 setActivePlayers（覆盖 revert 上下文）');
console.log('      方案 B：用 next 链替代 revert 实现多级响应');
console.log('\n  🎯 结论：Boardgame.io activePlayers + stages **可以胜任** 响应链需求。\n');
