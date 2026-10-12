// 出牌策略：每条启发式一个用例，外加「只吃视图」的用例

import { describe, it, expect } from 'vitest';
import { viewFor } from '@icgame/game-engine';
import type { CardID } from '@icgame/shared';
import { planActionPlays } from './actionPolicy.js';
import { actionScene, seatIds, type State } from './playScene.js';

function viewOf(s: State, who: string) {
  return viewFor(s.G, who, { gameOver: false });
}

function plan(s: State, who: string) {
  return planActionPlays(viewOf(s, who), who);
}

describe('planActionPlays · 盗梦者', () => {
  it('所在层心锁 > 0 且有解封：解封排第一', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 2, hand: ['action_creation', 'action_unlock', 'action_shoot'] },
        master: { layer: 2, hand: [] },
      },
    });
    const { thieves } = seatIds(s.G);
    const out = plan(s, thieves[0]!);
    expect(out[0]).toMatchObject({ move: 'playUnlock', args: ['action_unlock'] });
  });

  it('有凭空造物就打（在射梦主之前）', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 2, hand: ['action_shoot', 'action_creation'] },
        master: { layer: 2, hand: [] },
      },
    });
    const { thieves } = seatIds(s.G);
    const moves = plan(s, thieves[0]!).map((p) => p.move);
    expect(moves.indexOf('playCreation')).toBeGreaterThanOrEqual(0);
    expect(moves.indexOf('playCreation')).toBeLessThan(moves.indexOf('playShoot'));
  });

  it('与梦主同层且有 SHOOT 类牌：射梦主，强的变体在前', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 3, hand: ['action_shoot', 'action_shoot_drill'] },
        master: { layer: 3, hand: [] },
      },
    });
    const { thieves, master } = seatIds(s.G);
    const out = plan(s, thieves[0]!);
    expect(out.map((p) => p.move)).toEqual(['playShootArmor', 'playShoot']);
    expect(out[0]!.args).toEqual([master, 'action_shoot_drill']);
  });

  it('梦主不在同层：不射', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 3, hand: ['action_shoot'] },
        master: { layer: 2, hand: [] },
      },
    });
    const { thieves } = seatIds(s.G);
    expect(plan(s, thieves[0]!)).toEqual([]);
  });

  it('所在层心锁已清：用梦境穿梭剂去更深的、还有心锁的相邻层', () => {
    const s = actionScene({
      actor: 0,
      locks: { 2: 0, 1: 2, 3: 2 },
      seats: {
        t0: { layer: 2, hand: ['action_dream_transit'] },
        master: { layer: 4, hand: [] },
      },
    });
    const { thieves } = seatIds(s.G);
    const out = plan(s, thieves[0]!);
    expect(out.map((p) => p.args)).toEqual([
      ['action_dream_transit', 3],
      ['action_dream_transit', 1],
    ]);
  });

  it('相邻层心锁也为 0：不穿梭', () => {
    const s = actionScene({
      actor: 0,
      locks: { 1: 0, 2: 0, 3: 0 },
      seats: {
        t0: { layer: 2, hand: ['action_dream_transit'] },
        master: { layer: 4, hand: [] },
      },
    });
    const { thieves } = seatIds(s.G);
    expect(plan(s, thieves[0]!)).toEqual([]);
  });

  it('心锁未清时不穿梭，也没有解封则什么都不打', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 2, hand: ['action_dream_transit', 'action_kick', 'action_telekinesis'] },
        master: { layer: 4, hand: [] },
      },
    });
    const { thieves } = seatIds(s.G);
    expect(plan(s, thieves[0]!)).toEqual([]);
  });

  it('不是自己的回合、不在出牌阶段、已在迷失层：不出牌', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 2, hand: ['action_unlock'] },
        t1: { layer: 2, hand: ['action_unlock'] },
      },
    });
    const { thieves } = seatIds(s.G);
    expect(plan(s, thieves[1]!)).toEqual([]);
    const draw = { ...s, G: { ...s.G, turnPhase: 'draw' as const } };
    expect(plan(draw, thieves[0]!)).toEqual([]);
    const limbo = actionScene({
      actor: 0,
      seats: { t0: { layer: 0, hand: ['action_unlock'] } },
    });
    expect(plan(limbo, seatIds(limbo.G).thieves[0]!)).toEqual([]);
  });
});

describe('planActionPlays · 梦主', () => {
  it('与盗梦者同层：SHOOT 类在前，KICK 在后；不射异层的盗梦者', () => {
    const s = actionScene({
      actor: 'master',
      seats: {
        master: { layer: 2, hand: ['action_kick', 'action_shoot'] },
        t0: { layer: 2, hand: [] },
        t1: { layer: 3, hand: [] },
      },
    });
    const { master, thieves } = seatIds(s.G);
    const out = plan(s, master);
    expect(out.map((p) => [p.move, p.args[0], p.args[1]])).toEqual([
      ['playShoot', thieves[0], 'action_shoot'],
      ['playKick', 'action_kick', thieves[0]],
    ]);
  });

  it('梦主有抽牌类就打，不主动打解封与复杂牌', () => {
    const s = actionScene({
      actor: 'master',
      seats: {
        master: { layer: 2, hand: ['action_unlock', 'action_graft', 'action_creation'] },
        t0: { layer: 4, hand: [] },
      },
    });
    const { master } = seatIds(s.G);
    expect(plan(s, master).map((p) => p.move)).toEqual(['playCreation']);
  });
});

describe('planActionPlays · 只吃视图', () => {
  it('改动他人手牌内容不改变决策', () => {
    const base = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 2, hand: ['action_unlock', 'action_creation'] },
        t1: { layer: 2, hand: ['action_unlock', 'action_unlock'] },
        master: { layer: 2, hand: ['action_shoot', 'action_kick'] },
      },
    });
    const { thieves, master } = seatIds(base.G);
    const altered: State = {
      ...base,
      G: {
        ...base.G,
        players: {
          ...base.G.players,
          [thieves[1]!]: { ...base.G.players[thieves[1]!]!, hand: ['action_graft'] as CardID[] },
          [master]: { ...base.G.players[master]!, hand: [] },
        },
      },
    };
    expect(plan(altered, thieves[0]!)).toEqual(plan(base, thieves[0]!));
  });

  it('他人手牌在视图里不可见（null），策略拿不到', () => {
    const s = actionScene({
      actor: 0,
      seats: { t0: { layer: 2, hand: ['action_unlock'] }, t1: { layer: 2, hand: ['action_kick'] } },
    });
    const { thieves } = seatIds(s.G);
    const v = viewOf(s, thieves[0]!);
    expect(v.players[thieves[1]!]!.hand).toBeNull();
  });
});
