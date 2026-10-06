// 邪念瘟疫：梦主派发完（可以一张不发）之后，该层手里一张贿赂牌都没有的盗梦者进入迷失层；
// 此前收到过贿赂牌的（包括失败的）不受影响；不算被击杀。全部经对局运行器驱动真实 move。
// 对照：docs/manual/07-nightmare-cards.md 邪念瘟疫（17-20 行）

import { describe, it, expect } from 'vitest';
import type { Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { c, fixedRandom, game, KICK, load, scene, withPlayer } from './testing/runnerHarness.js';
import { withBribes } from './testing/fixtures.js';

const PLAGUE = c('nightmare_plague');

/** p1 / p2 / p3 与梦魇同在第 1 层；p1 此前已持有一张失败的贿赂牌 */
function plagueScene(poolExtra: Parameters<typeof withBribes>[1] = []): SetupState {
  const base = scene({
    p1: { layer: 1, hand: [KICK, KICK] },
    p2: { layer: 1, hand: [KICK, KICK] },
    p3: { layer: 1, hand: [KICK, KICK] },
    p4: { layer: 3, hand: [KICK] },
    pM: { layer: 2, hand: [KICK] },
  });
  const layers: SetupState['layers'] = {
    ...base.layers,
    1: { ...base.layers[1]!, nightmareId: PLAGUE, nightmareRevealed: true },
  };
  const held = withPlayer({ ...base, layers }, 'p1', { bribeReceived: 1 });
  return withBribes(held, [
    { id: 'held-fail', kind: 'fail', status: 'dealt', heldBy: 'p1', originalOwnerId: 'p1' },
    ...poolExtra,
  ]);
}

function activate(G: SetupState, bribedTargets: string[]) {
  const res = applyMove(
    game,
    load(G),
    { playerID: 'pM', move: 'masterActivateNightmare', args: [1 as Layer, { bribedTargets }] },
    { random: fixedRandom(1) },
  );
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('masterActivateNightmare 被拒绝');
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  return res.state.G;
}

const POOL_FAIL = [
  { id: 'pool-fail', kind: 'fail' as const, status: 'inPool' as const },
] satisfies Parameters<typeof withBribes>[1];

describe('邪念瘟疫：没有贿赂牌的才进迷失层', () => {
  it('此前持有失败贿赂牌的不受影响、本次被点名的拿到一张、什么都没有的进迷失层', () => {
    const after = activate(plagueScene(POOL_FAIL), ['p2']);
    expect(after.players.p1!.currentLayer).toBe(1);
    expect(after.players.p1!.isAlive).toBe(true);
    expect(after.players.p2!.currentLayer).toBe(1);
    expect(after.players.p2!.isAlive).toBe(true);
    expect(after.players.p2!.bribeReceived).toBe(1);
    expect(after.players.p3!.currentLayer).toBe(0);
    expect(after.players.p3!.isAlive).toBe(false);
  });

  it('梦主一张不发：此前持有贿赂牌的仍不受影响，其余两人进迷失层', () => {
    const after = activate(plagueScene(POOL_FAIL), []);
    expect(after.players.p1!.currentLayer).toBe(1);
    expect(after.players.p2!.currentLayer).toBe(0);
    expect(after.players.p3!.currentLayer).toBe(0);
  });

  it('不算被击杀：进迷失层的人手牌原样保留，没有人收到他的手牌', () => {
    const before = plagueScene(POOL_FAIL);
    const after = activate(before, []);
    expect(after.players.p3!.hand).toEqual(before.players.p3!.hand);
    expect(after.players.pM!.hand).toEqual(before.players.pM!.hand);
    expect(after.players.pM!.shootCount).toBe(before.players.pM!.shootCount);
  });

  it('贿赂池已空：指定派发的人没有拿到牌，也没有旧牌 → 进迷失层；有旧牌的仍不受影响', () => {
    const after = activate(plagueScene(), ['p2']);
    expect(after.players.p1!.currentLayer).toBe(1);
    expect(after.players.p2!.currentLayer).toBe(0);
    expect(after.players.p3!.currentLayer).toBe(0);
  });

  it('已转为梦主阵营的背叛者持有成功的贿赂牌，不受影响', () => {
    const base = plagueScene();
    const betrayer = withBribes(withPlayer(base, 'p3', { faction: 'master', bribeReceived: 1 }), [
      ...base.bribePool,
      { id: 'held-deal', kind: 'deal', status: 'deal', heldBy: 'p3', originalOwnerId: 'p3' },
    ]);
    const after = activate(betrayer, []);
    expect(after.players.p3!.currentLayer).toBe(1);
    expect(after.players.p2!.currentLayer).toBe(0);
  });
});
