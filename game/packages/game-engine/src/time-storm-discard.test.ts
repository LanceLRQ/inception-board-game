// 时间风暴：牌库顶的 10 张进弃牌堆；只有时间风暴自己移出游戏；从手中以任何方式弃掉都触发；
// 被别的效果从牌库顶弃掉的时间风暴不触发，留在弃牌堆。全部经对局运行器驱动真实 move。
// 对照：docs/manual/04-action-cards.md 时间风暴（发动效果与解析）

import { describe, it, expect } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyMove } from './runner/matchRunner.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import {
  c,
  game,
  KICK,
  SHOOT,
  TIME_STORM,
  TRANSIT,
  UNLOCK,
  fixedRandom,
  load,
  scene,
  withPlayer,
} from './testing/runnerHarness.js';

/** 全部牌的总数：手牌 + 牌库 + 弃牌堆 + 移出游戏（另有贿赂、金库等不在此列） */
function totalCards(G: SetupState): number {
  const inHands = Object.values(G.players).reduce((n, p) => n + p.hand.length, 0);
  return inHands + G.deck.cards.length + G.deck.discardPile.length + G.removedFromGame.length;
}

function count(cards: readonly CardID[], id: CardID): number {
  return cards.filter((x) => x === id).length;
}

function run(G: SetupState, playerID: string, move: string, args: unknown[]) {
  const res = applyMove(game, load(G), { playerID, move, args }, { random: fixedRandom(3) });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝`);
  expect(checkStateInvariants(res.state.G)).toEqual([]);
  return res.state.G;
}

function base(p1Hand: CardID[], extra: Partial<SetupState> = {}): SetupState {
  return scene(
    {
      p1: { layer: 1, hand: p1Hand },
      p2: { layer: 1, hand: [KICK] },
      p3: { layer: 2, hand: [KICK] },
      p4: { layer: 3, hand: [KICK] },
      pM: { layer: 1, hand: [KICK] },
    },
    { currentPlayerID: 'p1', ...extra },
  );
}

/** 断言一次风暴结算：10 张进弃牌堆，移出游戏的只有 n 张时间风暴 */
function expectStormSettled(before: SetupState, after: SetupState, storms = 1) {
  expect(after.removedFromGame).toEqual(Array<CardID>(storms).fill(TIME_STORM));
  expect(after.deck.cards).toHaveLength(before.deck.cards.length - 10 * storms);
  expect(count(after.deck.discardPile, TIME_STORM)).toBe(0);
  expect(totalCards(after)).toBe(totalCards(before));
}

describe('时间风暴·打出', () => {
  it('10 张进弃牌堆，移出游戏的只有时间风暴 1 张', () => {
    const before = base([TIME_STORM, UNLOCK]);
    const after = run(before, 'p1', 'playTimeStorm', [TIME_STORM]);
    expectStormSettled(before, after);
    expect(after.deck.discardPile).toHaveLength(10);
    expect(after.players.p1!.hand).toEqual([UNLOCK]);
  });

  it('牌库不足 10 张时翻全部', () => {
    const before = base([TIME_STORM], { deck: { cards: [KICK, SHOOT, UNLOCK], discardPile: [] } });
    const after = run(before, 'p1', 'playTimeStorm', [TIME_STORM]);
    expect(after.deck.cards).toHaveLength(0);
    expect(after.deck.discardPile).toEqual([KICK, SHOOT, UNLOCK]);
    expect(after.removedFromGame).toEqual([TIME_STORM]);
  });

  it('打出的不是时间风暴：正常进弃牌堆，牌库不动', () => {
    const before = base([KICK, UNLOCK]);
    const after = run(before, 'p1', 'playKick', [KICK, 'p3']);
    expect(after.deck.discardPile).toEqual([KICK]);
    expect(after.deck.cards).toHaveLength(30);
    expect(after.removedFromGame).toEqual([]);
  });
});

describe('时间风暴·从手中弃掉', () => {
  it('弃牌阶段弃掉：同样 10 张进弃牌堆、只有风暴自己移出游戏', () => {
    const before = base([TIME_STORM, KICK, KICK, KICK, KICK, KICK], { turnPhase: 'discard' });
    const after = run(before, 'p1', 'doDiscard', [[TIME_STORM]]);
    expectStormSettled(before, after);
    expect(after.deck.discardPile).toHaveLength(10);
  });

  it('一次弃 2 张时间风暴：各触发一次', () => {
    const before = base([TIME_STORM, TIME_STORM, KICK, KICK, KICK, KICK, KICK], {
      turnPhase: 'discard',
    });
    const after = run(before, 'p1', 'doDiscard', [[TIME_STORM, TIME_STORM]]);
    expectStormSettled(before, after, 2);
  });

  it('为复活别人而弃掉：触发', () => {
    const dead = withPlayer(base([TIME_STORM, KICK, KICK]), 'p2', {
      isAlive: false,
      currentLayer: 0,
      deathTurn: 3,
    });
    const before = {
      ...dead,
      layers: {
        ...dead.layers,
        0: { ...dead.layers[1]!, layer: 0, playersInLayer: ['p2'] },
        1: { ...dead.layers[1]!, playersInLayer: ['p1', 'pM'] },
      },
    } as SetupState;
    const after = run(before, 'p1', 'playRevive', ['p2', [TIME_STORM, KICK]]);
    expect(after.players.p2!.isAlive).toBe(true);
    expectStormSettled(before, after);
    // 另一张复活代价正常进弃牌堆
    expect(count(after.deck.discardPile, KICK)).toBe(11);
  });

  it('自己复活自己时代价确实从手里扣掉，弃掉风暴同样触发', () => {
    const dead = withPlayer(base([TIME_STORM, KICK, UNLOCK]), 'p1', {
      isAlive: false,
      currentLayer: 0,
      deathTurn: 3,
    });
    const before = {
      ...dead,
      layers: {
        ...dead.layers,
        0: { ...dead.layers[1]!, layer: 0, playersInLayer: ['p1'] },
        1: { ...dead.layers[1]!, playersInLayer: ['p2', 'pM'] },
      },
    } as SetupState;
    const after = run(before, 'p1', 'playRevive', [null, [TIME_STORM, KICK]]);
    expect(after.players.p1!.hand).toEqual([UNLOCK]);
    expectStormSettled(before, after);
  });

  it('作为技能的弃牌代价弃掉（药剂师·调剂）：触发', () => {
    const before = withPlayer(
      base([TIME_STORM], { deck: { cards: Array(30).fill(KICK), discardPile: [TRANSIT] } }),
      'p1',
      {
        characterId: c('thief_chemist'),
      },
    );
    const after = run(before, 'p1', 'playChemistRefine', [TIME_STORM]);
    expect(after.players.p1!.hand).toEqual([TRANSIT]);
    expect(after.removedFromGame).toEqual([TIME_STORM]);
    expect(after.deck.cards).toHaveLength(20);
    expect(totalCards(after)).toBe(totalCards(before));
  });

  it('梦魇逼迫弃手牌（饥饿撕咬）弃掉风暴：触发', () => {
    const start = base([TIME_STORM, KICK, KICK], { currentPlayerID: 'pM', turnPhase: 'action' });
    const before: SetupState = {
      ...start,
      layers: {
        ...start.layers,
        1: {
          ...start.layers[1]!,
          nightmareId: c('nightmare_hunger_bite'),
          nightmareRevealed: true,
        },
      },
    };
    const after = run(before, 'pM', 'masterActivateNightmare', [1, { bribedTargets: [] }]);
    expect(after.removedFromGame).toEqual([TIME_STORM]);
    expect(totalCards(after)).toBe(totalCards(before));
  });
});

describe('时间风暴·不触发的情形', () => {
  it('被别的效果从牌库顶弃掉的时间风暴留在弃牌堆，不触发', () => {
    const deck = [TIME_STORM, ...Array<CardID>(29).fill(KICK)];
    const start = base([KICK], { currentPlayerID: 'pM', deck: { cards: deck, discardPile: [] } });
    const before: SetupState = {
      ...start,
      layers: {
        ...start.layers,
        2: {
          ...start.layers[2]!,
          nightmareId: c('nightmare_despair_storm'),
          nightmareRevealed: true,
        },
      },
    };
    const after = run(before, 'pM', 'masterActivateNightmare', [2, { bribedTargets: [] }]);
    // 绝望风暴：牌库顶 10 张进弃牌堆，其中的时间风暴没有触发
    expect(count(after.deck.discardPile, TIME_STORM)).toBe(1);
    expect(after.removedFromGame).toEqual([]);
    expect(after.deck.cards).toHaveLength(20);
    expect(totalCards(after)).toBe(totalCards(before));
  });

  it('时间风暴自己翻出的牌里有时间风暴：留在弃牌堆，不连锁', () => {
    const deck = [KICK, TIME_STORM, ...Array<CardID>(28).fill(KICK)];
    const before = base([TIME_STORM], { deck: { cards: deck, discardPile: [] } });
    const after = run(before, 'p1', 'playTimeStorm', [TIME_STORM]);
    expect(count(after.deck.discardPile, TIME_STORM)).toBe(1);
    expect(after.removedFromGame).toEqual([TIME_STORM]);
    expect(after.deck.cards).toHaveLength(20);
  });
});
