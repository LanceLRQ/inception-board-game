// 白羊·闪耀：每有 1 张弃掉的梦魇牌，抽牌阶段可多抽 1 张，多抽几张由白羊自己决定（0 到上限）。
// 发动过的梦魇牌和直接弃掉的梦魇牌都算数。经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 白羊（第 66 行技能、第 70 行详述
//   「【闪耀】的技能可以让玩家自行选择抽取数量。如弃掉的梦魇牌为2张，则白羊抽牌阶段可自行选择抽取2-4张手牌」）

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import { ariesExtraDrawLimit } from './engine/skills.js';
import { c, fixedRandom, game, KICK, load, scene, withPlayer } from './testing/runnerHarness.js';

const ARIES = c('thief_aries');
const DESPAIR = c('nightmare_despair_storm');
const HUNGER = c('nightmare_hunger_bite');

/** p1 是白羊，轮到 p1 的抽牌阶段；已弃梦魇 used 张；手里 1 张牌，牌库 30 张 */
function ariesDrawScene(used: number, extra: Partial<SetupState> = {}): SetupState {
  const G = scene(
    {
      p1: { layer: 2, hand: [KICK] },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 3, hand: [KICK] },
      p4: { layer: 4, hand: [KICK] },
      pM: { layer: 1, hand: [KICK] },
    },
    {
      currentPlayerID: 'p1',
      turnPhase: 'draw',
      usedNightmareIds: Array<CardID>(used).fill(HUNGER),
      ...extra,
    },
  );
  return withPlayer(G, 'p1', { characterId: ARIES });
}

function draw(G: SetupState, args: unknown[], playerID = 'p1') {
  return applyMove(game, load(G), { playerID, move: 'doDraw', args }, { random: fixedRandom(3) });
}

function handAfter(G: SetupState, args: unknown[]): number {
  const res = draw(G, args);
  expect(res.ok, res.ok ? '' : `被拒绝：${res.reason}`).toBe(true);
  if (!res.ok) throw new Error('unreachable');
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  return res.state.G.players.p1!.hand.length;
}

describe('白羊·闪耀：多抽几张由白羊自选', () => {
  it('弃掉 2 张梦魇：可选 0 / 1 / 2 张，总共抽 2 / 3 / 4 张', () => {
    expect(handAfter(ariesDrawScene(2), [0])).toBe(1 + 2);
    expect(handAfter(ariesDrawScene(2), [1])).toBe(1 + 3);
    expect(handAfter(ariesDrawScene(2), [2])).toBe(1 + 4);
  });

  it('不带参数时抽满（Bot 与旧客户端的缺省行为）', () => {
    expect(handAfter(ariesDrawScene(2), [])).toBe(1 + 4);
    expect(handAfter(ariesDrawScene(2), [null])).toBe(1 + 4);
    expect(handAfter(ariesDrawScene(0), [])).toBe(1 + 2);
  });

  it('选的张数超过上限被拒绝，状态不动', () => {
    expect(draw(ariesDrawScene(2), [3]).ok).toBe(false);
    expect(draw(ariesDrawScene(0), [1]).ok).toBe(false);
    // 没有弃掉的梦魇时，选 0 是合法的
    expect(draw(ariesDrawScene(0), [0]).ok).toBe(true);
  });

  it('畸形的张数被拒绝：负数、小数、字符串、对象', () => {
    for (const bad of [-1, 0.5, '1', {}, [1], true, Number.NaN]) {
      expect(draw(ariesDrawScene(2), [bad]).ok, String(bad)).toBe(false);
    }
  });

  it('选 0 张也是一次正常的抽牌阶段：进入出牌阶段，不触发别的东西', () => {
    const res = draw(ariesDrawScene(3), [0]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.turnPhase).toBe('action');
    expect(res.state.G.deck.cards).toHaveLength(30 - 2);
  });

  it('不是白羊的玩家带这个参数被拒绝', () => {
    const G = withPlayer(ariesDrawScene(2), 'p1', { characterId: c('thief_athena') });
    expect(draw(G, [0]).ok).toBe(false);
    expect(draw(G, []).ok).toBe(true);
  });

  it('白羊已死亡时没有上限', () => {
    const G = withPlayer(ariesDrawScene(2), 'p1', { isAlive: false });
    expect(ariesExtraDrawLimit(G, 'p1')).toBe(0);
  });

  it('牌库不够时多抽的张数以牌库为限', () => {
    const G = ariesDrawScene(4, { deck: { cards: [KICK, KICK, KICK], discardPile: [] } });
    expect(handAfter(G, [4])).toBe(1 + 3);
  });

  it('别人的回合里，白羊不会多抽', () => {
    const G = withPlayer(ariesDrawScene(2, { currentPlayerID: 'p2' }), 'p2', {});
    const res = draw(G, [], 'p2');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p1!.hand).toHaveLength(1);
  });
});

describe('白羊·闪耀：弃掉的梦魇牌的计数口径', () => {
  /** 第 3 层有一张梦魇；revealed 决定它是否已被翻开 */
  function withNightmare(revealed: boolean, extra: Partial<SetupState> = {}): SetupState {
    const G = ariesDrawScene(0, { turnPhase: 'action', ...extra });
    return {
      ...G,
      layers: {
        ...G.layers,
        3: { ...G.layers[3]!, nightmareId: DESPAIR, nightmareRevealed: revealed },
      },
    };
  }

  function run(G: SetupState, playerID: string, move: string, args: unknown[] = []): SetupState {
    const res = applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(3) });
    expect(res.ok, `${move} 被拒绝：${res.ok ? '' : res.reason}`).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    return res.state.G;
  }

  it('梦主弃掉已翻开的梦魇：计 1 张', () => {
    const G = withNightmare(true, { currentPlayerID: 'pM' });
    const after = run(G, 'pM', 'masterDiscardNightmare', [3]);
    expect(ariesExtraDrawLimit(after, 'p1')).toBe(1);
  });

  it('梦主发动已翻开的梦魇：计 1 张', () => {
    const G = withNightmare(true, { currentPlayerID: 'pM' });
    const after = run(G, 'pM', 'masterActivateNightmare', [3]);
    expect(ariesExtraDrawLimit(after, 'p1')).toBe(1);
  });

  it('白羊·星尘选择弃掉：计 1 张', () => {
    const G = withNightmare(false, {
      pendingAriesChoice: { ariesID: 'p1', victimLayer: 3, victimID: 'p3' },
    });
    const after = run(G, 'p1', 'playAriesStardustDiscard');
    expect(ariesExtraDrawLimit(after, 'p1')).toBe(1);
  });

  it('白羊·星尘选择发动：计 1 张', () => {
    const G = withNightmare(false, {
      pendingAriesChoice: { ariesID: 'p1', victimLayer: 3, victimID: 'p3' },
    });
    const after = run(G, 'p1', 'playAriesStardustActivate', []);
    expect(ariesExtraDrawLimit(after, 'p1')).toBe(1);
  });
});
