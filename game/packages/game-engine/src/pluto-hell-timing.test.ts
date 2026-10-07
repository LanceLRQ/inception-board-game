// 冥王星·地狱世界观：抽牌阶段结束的那一刻检视手牌，≥6 张则该回合结束进入迷失层。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/06-dream-master.md 冥王星·地狱（世界观与详述：只在抽牌阶段检视，此后变多无效）

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import {
  c,
  game,
  KICK,
  TURN,
  fixedRandom,
  load,
  scene,
  withPlayer,
} from './testing/runnerHarness.js';

function plutoScene(p1Hand: CardID[], master = 'dm_pluto_hell'): SetupState {
  const base = scene(
    {
      p1: { layer: 1, hand: p1Hand },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: 1, hand: [KICK] },
    },
    { currentPlayerID: 'p1', turnPhase: 'draw' },
  );
  return withPlayer(base, 'pM', { characterId: c(master) });
}

function step(G: SetupState, move: string, args: unknown[] = [], roll = 2) {
  const res = applyMove(
    game,
    load(G),
    { playerID: 'p1', move, args },
    { random: fixedRandom(roll) },
  );
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝`);
  return res.state.G;
}

describe('冥王星·地狱：检视手牌的时机', () => {
  it('抽完牌手牌 6 张：本回合照常行动，弃到 5 张后回合结束进入迷失层且不交牌', () => {
    // 手牌 4 张 + 掷骰 2 = 6
    let G = step(plutoScene([KICK, KICK, KICK, KICK]), 'doDraw', [], 2);
    expect(G.turnPhase).toBe('action');
    expect(G.players.p1!.hand).toHaveLength(6);
    expect(G.players.p1!.isAlive).toBe(true);
    G = step(G, 'endActionPhase');
    G = step(G, 'doDiscard', [[KICK]]);
    const p = G.players.p1!;
    expect(p.isAlive).toBe(false);
    expect(p.currentLayer).toBe(0);
    expect(p.deathTurn).toBe(TURN);
    expect(p.hand).toHaveLength(5);
    expect(G.players.pM!.shootCount).toBe(0);
    expect(G.players.pM!.hand).toEqual([KICK]);
    expect(checkStateInvariants(G)).toEqual([]);
  });

  it('抽完牌 5 张、行动阶段涨到 7 张：此后变多不追加，不进迷失层', () => {
    let G = step(plutoScene([KICK, KICK, KICK]), 'doDraw', [], 2);
    expect(G.players.p1!.hand).toHaveLength(5);
    G = withPlayer(G, 'p1', { hand: [...G.players.p1!.hand, KICK, KICK] });
    G = step(G, 'endActionPhase');
    G = step(G, 'doDiscard', [[KICK, KICK]]);
    expect(G.players.p1!.isAlive).toBe(true);
    expect(G.players.p1!.currentLayer).toBe(1);
  });

  it('跳过抽牌阶段时也在抽牌阶段结束处检视（手牌本就 ≥6）', () => {
    let G = step(plutoScene([KICK, KICK, KICK, KICK, KICK, KICK]), 'skipDraw');
    G = step(G, 'endActionPhase');
    G = step(G, 'doDiscard', [[KICK]]);
    expect(G.players.p1!.isAlive).toBe(false);
    expect(G.players.p1!.currentLayer).toBe(0);
  });

  it('非冥王星梦主：抽完 6 张也不触发', () => {
    let G = step(plutoScene([KICK, KICK, KICK, KICK, KICK], 'dm_fortress'), 'doDraw');
    G = step(G, 'endActionPhase');
    G = step(G, 'doDiscard', [[KICK, KICK]]);
    expect(G.players.p1!.isAlive).toBe(true);
  });
});
