// 复活自己的当回合不能用【解封】的效果①（解锁），仍可用效果②（抵消别人的解封）；被别人复活的不受限。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/04-action-cards.md 解封（效果①「复活后不能在当回合使用此效果」）；
//       docs/manual/03-game-flow.md 复活

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { beginTurn } from './stateOps.js';
import { sendToLimbo } from './engine/death.js';
import {
  game,
  KICK,
  UNLOCK,
  fixedRandom,
  load,
  scene,
  withPlayer,
} from './testing/runnerHarness.js';

function play(G: SetupState, playerID: string, move: string, args: unknown[]) {
  return applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(3) });
}

function okPlay(G: SetupState, playerID: string, move: string, args: unknown[]): SetupState {
  const res = play(G, playerID, move, args);
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝`);
  return res.state.G;
}

/** p1 在迷失层，手里有解封；p2 在第 2 层 */
function limboScene(p1Hand: CardID[], p2Hand: CardID[] = [KICK, KICK]): SetupState {
  const base = scene(
    {
      p1: { layer: 1, hand: p1Hand },
      p2: { layer: 2, hand: p2Hand },
      p3: { layer: 1, hand: [KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: 1, hand: [KICK] },
    },
    { currentPlayerID: 'p1' },
  );
  return sendToLimbo(base, 'p1');
}

describe('复活后的【解封】限制', () => {
  it('自己复活自己后，当回合打出解封效果①被拒绝', () => {
    const revived = okPlay(limboScene([KICK, KICK, UNLOCK]), 'p1', 'playRevive', [
      null,
      [KICK, KICK],
    ]);
    expect(revived.players.p1!.isAlive).toBe(true);
    expect(play(revived, 'p1', 'playUnlock', [UNLOCK]).ok).toBe(false);
  });

  it('没复活过的盗梦者同样条件下可以解锁（对照）', () => {
    const base = scene(
      {
        p1: { layer: 1, hand: [UNLOCK] },
        p2: { layer: 2, hand: [KICK] },
        p3: { layer: 1, hand: [KICK] },
        p4: { layer: 3, hand: [KICK] },
        pM: { layer: 1, hand: [KICK] },
      },
      { currentPlayerID: 'p1' },
    );
    expect(play(base, 'p1', 'playUnlock', [UNLOCK]).ok).toBe(true);
  });

  it('下一个自己的回合开始后可以用', () => {
    const revived = okPlay(limboScene([KICK, KICK, UNLOCK]), 'p1', 'playRevive', [
      null,
      [KICK, KICK],
    ]);
    const nextOwnTurn: SetupState = { ...beginTurn(revived, 'p1'), turnPhase: 'action' };
    expect(play(nextOwnTurn, 'p1', 'playUnlock', [UNLOCK]).ok).toBe(true);
  });

  it('被别人复活的人，轮到自己的回合可以用解封效果①', () => {
    // p2 在第 2 层，复活迷失层里的 p1，p1 落在第 2 层
    let G = limboScene([UNLOCK]);
    G = { ...withPlayer(G, 'p2', { hand: [KICK, KICK] }), currentPlayerID: 'p2' };
    const revived = okPlay(G, 'p2', 'playRevive', ['p1', [KICK, KICK]]);
    expect(revived.players.p1!.isAlive).toBe(true);
    const p1Turn: SetupState = { ...revived, currentPlayerID: 'p1', turnPhase: 'action' };
    expect(play(p1Turn, 'p1', 'playUnlock', [UNLOCK]).ok).toBe(true);
  });

  it('自己复活自己的人仍可用效果②抵消别人的解封', () => {
    const revived = okPlay(limboScene([KICK, KICK, UNLOCK]), 'p1', 'playRevive', [
      null,
      [KICK, KICK],
    ]);
    // 轮到 p2 在第 2 层打出解封效果①（p2 手里有解封），p1 在第 1 层响应
    const p2Turn: SetupState = withPlayer(
      { ...revived, currentPlayerID: 'p2', turnPhase: 'action' },
      'p2',
      { hand: [UNLOCK] },
    );
    const opened = okPlay(p2Turn, 'p2', 'playUnlock', [UNLOCK]);
    expect(opened.pendingResponseWindow?.responders).toContain('p1');
    const cancelled = play(opened, 'p1', 'respondCancelUnlock', [UNLOCK]);
    expect(cancelled.ok).toBe(true);
  });
});
