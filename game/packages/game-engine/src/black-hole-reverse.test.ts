// 黑洞·倒流接线：梦主每回合抽牌阶段，在金库没被打开的每层梦境各恢复 2 个心锁，不超过原有数量。
// 对照：docs/manual/06-dream-master.md 黑洞（129-139 行）：
//   「当轮到梦主回合，无论梦主此前死亡与否，都可以增加 2 个心锁」
//   「每一层梦境，只要是未被打开的金库，在梦主回合抽牌阶段都会增加 2 个心锁」
//   「心锁数的原有数量，指的是游戏开始时心锁的配置数量」
// 经真实 move（doDraw / skipDraw）驱动；5 人局原有心锁数为 [5, 4, 3, 2]。

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import { PLAYER_COUNT_CONFIGS } from './config.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { getOriginalHeartLocks, settleBlackHoleReverse } from './engine/skills.js';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { c, fixedRandom, game, KICK, load, scene, withPlayer } from './testing/runnerHarness.js';

const BLACK_HOLE = c('dm_black_hole');
const FORTRESS = c('dm_fortress');

/** 梦主的抽牌阶段；各层心锁由 locks 指定（第 1-4 层） */
function drawScene(
  locks: [number, number, number, number],
  masterChar: CardID = BLACK_HOLE,
  extra: Partial<SetupState> = {},
): SetupState {
  let G = scene(
    {
      p1: { layer: 1, hand: [KICK] },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 2, hand: [KICK] },
      p4: { layer: 2, hand: [KICK] },
      pM: { layer: 3, hand: [KICK] },
    },
    { currentPlayerID: 'pM', turnPhase: 'draw', ...extra },
  );
  G = withPlayer(G, 'pM', { characterId: masterChar });
  const layers = { ...G.layers };
  for (let l = 1; l <= 4; l++) {
    layers[l] = { ...layers[l]!, heartLockValue: locks[l - 1]! };
  }
  return { ...G, layers };
}

function openVault(G: SetupState, layer: number): SetupState {
  return {
    ...G,
    vaults: G.vaults.map((v) => (v.layer === layer ? { ...v, isOpened: true, openedBy: 'p1' } : v)),
  };
}

function ok(G: SetupState, playerID: string, move: string, args: unknown[] = []) {
  const res = applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(3) });
  expect(res.ok, `${move} 应被接受`).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝：${res.reason}`);
  return res.state.G;
}

const locksOf = (G: SetupState) => [1, 2, 3, 4].map((l) => G.layers[l]!.heartLockValue);

describe('黑洞·倒流 · 原有心锁数', () => {
  it('取自当前人数的配置，层号对应下标', () => {
    const G = drawScene([1, 1, 1, 1]);
    expect(getOriginalHeartLocks(G)).toEqual({ 1: 5, 2: 4, 3: 3, 4: 2 });
    expect(PLAYER_COUNT_CONFIGS[G.playerOrder.length]!.heartLocks).toEqual([5, 4, 3, 2]);
  });
});

describe('黑洞·倒流 · 抽牌阶段', () => {
  it('doDraw：每个未开金库的层各 +2，不超过原有数量', () => {
    const after = ok(drawScene([1, 3, 3, 1]), 'pM', 'doDraw');
    // L1 1→3；L2 3→4（上限 4）；L3 3→3（上限 3）；L4 1→2（上限 2）
    expect(locksOf(after)).toEqual([3, 4, 3, 2]);
    expect(checkStateInvariants(after)).toEqual([]);
  });

  it('doDraw 之后进入出牌阶段，并照常抽牌', () => {
    const G = drawScene([1, 1, 1, 1]);
    const after = ok(G, 'pM', 'doDraw');
    expect(after.turnPhase).toBe('action');
    expect(after.players.pM!.hand.length).toBeGreaterThan(G.players.pM!.hand.length);
  });

  it('skipDraw：略过抽牌也仍是抽牌阶段，同样恢复', () => {
    const G = drawScene([1, 1, 1, 1]);
    const after = ok(G, 'pM', 'skipDraw');
    expect(locksOf(after)).toEqual([3, 3, 3, 2]);
    expect(after.players.pM!.hand).toEqual(G.players.pM!.hand);
    expect(after.turnPhase).toBe('action');
  });

  it('金库已打开的层不恢复', () => {
    const G = openVault(drawScene([1, 1, 1, 1]), 2);
    const after = ok(G, 'pM', 'doDraw');
    expect(locksOf(after)).toEqual([3, 1, 3, 2]);
  });

  it('心锁已是原有数量：不变', () => {
    const G = drawScene([5, 4, 3, 2]);
    const after = ok(G, 'pM', 'doDraw');
    expect(locksOf(after)).toEqual([5, 4, 3, 2]);
  });

  it('心锁只差 1 个：补到原有数量为止', () => {
    const after = ok(drawScene([4, 3, 2, 1]), 'pM', 'doDraw');
    expect(locksOf(after)).toEqual([5, 4, 3, 2]);
  });

  it('梦主不是黑洞：心锁不恢复', () => {
    const after = ok(drawScene([1, 1, 1, 1], FORTRESS), 'pM', 'doDraw');
    expect(locksOf(after)).toEqual([1, 1, 1, 1]);
  });

  it('盗梦者的抽牌阶段不触发', () => {
    const G = drawScene([1, 1, 1, 1], BLACK_HOLE, { currentPlayerID: 'p1' });
    const after = ok(G, 'p1', 'doDraw');
    expect(locksOf(after)).toEqual([1, 1, 1, 1]);
  });

  it('恢复心锁不触发海王星的风暴，也不弃牌库', () => {
    const G = drawScene([1, 1, 1, 1]);
    const after = ok(G, 'pM', 'skipDraw');
    expect(after.deck.discardPile).toEqual(G.deck.discardPile);
    expect(after.deck.cards).toEqual(G.deck.cards);
  });
});

describe('黑洞·倒流 · 纯函数边界', () => {
  it('梦主此前死亡也照样恢复', () => {
    const G = withPlayer(drawScene([1, 1, 1, 1]), 'pM', { isAlive: false });
    expect(locksOf(settleBlackHoleReverse(G))).toEqual([3, 3, 3, 2]);
  });

  it('只在梦主自己的回合恢复', () => {
    const G = drawScene([1, 1, 1, 1], BLACK_HOLE, { currentPlayerID: 'p2' });
    expect(settleBlackHoleReverse(G)).toBe(G);
  });
});
