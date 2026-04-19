// BGIO 集成测试 - 验证 InceptionCityGame 在 BGIO 客户端下的回合 / Stage / CurrentPlayer 对齐
// 对照：plans/tasks.md P2 B18 人机本地模式完整走完一局
//
// 这里通过 boardgame.io/client 的 Local 多人模式模拟 Worker 侧的行为，
// 确保：
//   1. setup → playing 阶段切换后，BGIO.ctx.currentPlayer 与 G.currentPlayerID 对齐到梦主
//   2. draw → action → discard 三个 stage 的 moves 真正可被调用（不会被 BGIO 拒绝）
//   3. Bot 选择的 move 不会遭遇 disallowed move / canPlayerMakeMove=false

import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';

type BGIOClient = ReturnType<typeof Client<SetupState>>;

type AnyState = {
  G: SetupState;
  ctx: {
    currentPlayer: string;
    phase?: string | null;
    activePlayers?: Record<string, string> | null;
  };
};

let testCounter = 0;

function createClients(playerCount: number): BGIOClient[] {
  // 每个测试用独立 matchID，避免 BGIO Local master 单例状态污染
  const matchID = `test-match-${++testCounter}-${Date.now()}`;
  const multi = Local();
  const clients: BGIOClient[] = [];
  for (let i = 0; i < playerCount; i++) {
    const client = Client({
      game: InceptionCityGame as never,
      numPlayers: playerCount,
      multiplayer: multi,
      playerID: String(i),
      matchID,
    }) as unknown as BGIOClient;
    client.start();
    clients.push(client);
  }
  return clients;
}

function stateOf(client: BGIOClient): AnyState {
  return client.getState() as unknown as AnyState;
}

describe('InceptionCityGame · BGIO 集成', () => {
  it('setup 阶段完成后，ctx.currentPlayer 与 G.currentPlayerID 对齐到梦主', () => {
    const clients = createClients(4);
    const p0 = clients[0]!;

    // 初始状态：setup 阶段
    const before = stateOf(p0);
    expect(before.G.phase).toBe('setup');

    // 任意玩家调 completeSetup（setup 阶段的 move）
    (p0.moves as Record<string, (...args: unknown[]) => void>)['completeSetup']?.();

    const after = stateOf(p0);
    expect(after.G.phase).toBe('playing');
    expect(after.G.dreamMasterID).toBeTruthy();

    // 关键断言：BGIO ctx.currentPlayer 必须等于 G.currentPlayerID（梦主先手）
    expect(after.ctx.currentPlayer).toBe(after.G.currentPlayerID);
    expect(after.ctx.currentPlayer).toBe(after.G.dreamMasterID);

    clients.forEach((c) => c.stop());
  });

  it('playing 阶段下，当前玩家能成功调用 doDraw → endActionPhase → skipDiscard', () => {
    const clients = createClients(4);
    const p0 = clients[0]!;
    (p0.moves as Record<string, (...args: unknown[]) => void>)['completeSetup']?.();

    const afterSetup = stateOf(p0);
    const masterId = afterSetup.G.dreamMasterID!;
    const masterClient = clients[parseInt(masterId, 10)]!;

    expect(afterSetup.G.turnPhase).toBe('draw');

    // draw 阶段的 doDraw 必须可用
    (masterClient.moves as Record<string, (...args: unknown[]) => void>)['doDraw']?.();
    const afterDraw = stateOf(masterClient);
    expect(afterDraw.G.turnPhase).toBe('action');

    // action 阶段的 endActionPhase 必须可用
    (masterClient.moves as Record<string, (...args: unknown[]) => void>)['endActionPhase']?.();
    const afterAction = stateOf(masterClient);
    expect(afterAction.G.turnPhase).toBe('discard');

    // discard 阶段的 skipDiscard 必须可用，且会自动切换到下一回合
    (masterClient.moves as Record<string, (...args: unknown[]) => void>)['skipDiscard']?.();
    const afterDiscard = stateOf(masterClient);

    // 下一回合应切到下一个玩家（G.currentPlayerID 变化，ctx.currentPlayer 同步）
    expect(afterDiscard.ctx.currentPlayer).toBe(afterDiscard.G.currentPlayerID);
    expect(afterDiscard.G.turnPhase).toBe('draw');
    expect(afterDiscard.G.turnNumber).toBeGreaterThan(afterDraw.G.turnNumber);

    clients.forEach((c) => c.stop());
  });

  it('初始状态：ctx.phase 为 setup，completeSetup move 可用', () => {
    const clients = createClients(4);
    const p0 = clients[0]!;

    const before = stateOf(p0);
    expect(before.ctx.phase).toBe('setup');

    // setup phase 下 completeSetup move 必须可用
    const moves = p0.moves as Record<string, unknown>;
    expect(moves['completeSetup']).toBeDefined();

    clients.forEach((c) => c.stop());
  });

  it('完整跑完一回合后，currentPlayer 按 playerOrder 顺时针切换', () => {
    const clients = createClients(4);
    const p0 = clients[0]!;
    (p0.moves as Record<string, (...args: unknown[]) => void>)['completeSetup']?.();

    const s1 = stateOf(p0);
    const masterId = s1.G.dreamMasterID!;
    const playerOrder = s1.G.playerOrder;
    const masterIdx = playerOrder.indexOf(masterId);
    const expectedNextId = playerOrder[(masterIdx + 1) % playerOrder.length]!;

    const masterClient = clients[parseInt(masterId, 10)]!;
    const moves = masterClient.moves as Record<string, (...args: unknown[]) => void>;

    moves['doDraw']?.();
    moves['endActionPhase']?.();
    moves['skipDiscard']?.();

    const after = stateOf(masterClient);
    expect(after.G.currentPlayerID).toBe(expectedNextId);
    expect(after.ctx.currentPlayer).toBe(expectedNextId);

    clients.forEach((c) => c.stop());
  });
});
