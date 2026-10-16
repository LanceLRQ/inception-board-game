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
    expect(out.map((p) => p.move)).toEqual(['playShootDrill', 'playShoot']);
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
  it('与盗梦者同层：射 SHOOT 类，不打 KICK；不射异层的盗梦者', () => {
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
    ]);
  });

  it('梦主有抽牌类就打，不主动打解封与复杂牌', () => {
    const s = actionScene({
      actor: 'master',
      rest: 'limbo',
      seats: {
        master: { layer: 2, hand: ['action_unlock', 'action_graft', 'action_creation'] },
        t0: { layer: 4, hand: [] },
      },
    });
    const { master } = seatIds(s.G);
    // 唯一的盗梦者在第 4 层，梦主在第 2 层：先朝它走一步，再抽牌
    expect(plan(s, master).map((p) => p.move)).toEqual(['dreamMasterMove', 'playCreation']);
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

describe('planActionPlays · 复活', () => {
  it('迷失层的盗梦者：手牌够就复活自己，其余动作都不给', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 1, hand: ['action_kick', 'action_graft', 'action_unlock'], limbo: true },
        master: { layer: 2, hand: [] },
      },
    });
    const { thieves } = seatIds(s.G);
    const out = plan(s, thieves[0]!);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      move: 'playRevive',
      args: [null, ['action_kick', 'action_graft']],
    });
  });

  it('迷失层手牌不够 2 张：不给', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 1, hand: ['action_kick'], limbo: true },
        master: { layer: 2, hand: [] },
      },
    });
    expect(plan(s, seatIds(s.G).thieves[0]!)).toEqual([]);
  });

  it('弃牌价值：先弃不会打的牌，再弃重复牌，最后才是解封', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 1, hand: ['action_unlock', 'action_unlock', 'action_creation'], limbo: true },
        master: { layer: 2, hand: [] },
      },
    });
    const out = plan(s, seatIds(s.G).thieves[0]!);
    // 第二张解封是重复牌，先于凭空造物弃出
    expect(out[0]!.args[1]).toEqual(['action_unlock', 'action_creation']);
  });

  it('密道世界观：另给只弃 1 张梦境穿梭剂的候选', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 1, hand: ['action_dream_transit', 'action_kick'], limbo: true },
        master: { layer: 2, hand: [] },
      },
    });
    const out = plan(s, seatIds(s.G).thieves[0]!);
    expect(out.map((p) => p.args[1])).toEqual([
      ['action_kick', 'action_dream_transit'],
      ['action_dream_transit'],
    ]);
  });

  it('盗梦者复活同伴：排在解封之后、造物之前；用不会打的牌付代价，保留解封与 SHOOT', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: {
          layer: 2,
          hand: [
            'action_unlock',
            'action_creation',
            'action_graft',
            'action_gravity',
            'action_shoot',
          ],
        },
        t1: { layer: 1, hand: [], limbo: true },
        master: { layer: 4, hand: [] },
      },
    });
    const { thieves } = seatIds(s.G);
    const out = plan(s, thieves[0]!);
    expect(out.map((p) => p.move)).toEqual(['playUnlock', 'playRevive', 'playCreation']);
    expect(out[1]!.args).toEqual([thieves[1], ['action_graft', 'action_gravity']]);
  });

  it('同伴复活的代价只肯用不重要的牌：只剩解封 / SHOOT 时不复活同伴', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 2, hand: ['action_unlock', 'action_shoot', 'action_graft'] },
        t1: { layer: 1, hand: [], limbo: true },
        master: { layer: 4, hand: [] },
      },
    });
    const { thieves } = seatIds(s.G);
    expect(plan(s, thieves[0]!).map((p) => p.move)).toEqual(['playUnlock']);
  });

  it('梦主不复活盗梦者', () => {
    const s = actionScene({
      actor: 'master',
      seats: {
        master: { layer: 2, hand: ['action_graft', 'action_gravity', 'action_resonance'] },
        t0: { layer: 1, hand: [], limbo: true },
      },
    });
    expect(plan(s, seatIds(s.G).master).map((p) => p.move)).not.toContain('playRevive');
  });
});

describe('planActionPlays · 梦主移动', () => {
  const masterScene = (seats: Record<string, { layer: number; hand: string[] }>, locks = {}) =>
    actionScene({ actor: 'master', seats, locks, rest: 'limbo' });

  it('同层已有盗梦者：不动', () => {
    const s = masterScene({ master: { layer: 2, hand: [] }, t0: { layer: 2, hand: [] } });
    expect(plan(s, seatIds(s.G).master).map((p) => p.move)).not.toContain('dreamMasterMove');
  });

  it('相邻层有盗梦者：移过去，且排在出牌之前', () => {
    const s = masterScene({
      master: { layer: 2, hand: ['action_creation'] },
      t0: { layer: 3, hand: [] },
    });
    const out = plan(s, seatIds(s.G).master);
    expect(out[0]).toMatchObject({ move: 'dreamMasterMove', args: [3] });
    expect(out.map((p) => p.move)).toEqual(['dreamMasterMove', 'playCreation']);
  });

  it('远处有盗梦者：朝最近的有人层走一步', () => {
    const s = masterScene({ master: { layer: 1, hand: [] }, t0: { layer: 4, hand: [] } });
    expect(plan(s, seatIds(s.G).master)).toMatchObject([{ move: 'dreamMasterMove', args: [2] }]);
  });

  it('两侧相邻都有人：人数多的优先，人数相同取心锁少的', () => {
    const many = masterScene({
      master: { layer: 2, hand: [] },
      t0: { layer: 1, hand: [] },
      t1: { layer: 3, hand: [] },
      t2: { layer: 3, hand: [] },
    });
    expect(plan(many, seatIds(many.G).master)[0]).toMatchObject({ args: [3] });
    const tie = masterScene(
      { master: { layer: 2, hand: [] }, t0: { layer: 1, hand: [] }, t1: { layer: 3, hand: [] } },
      { 1: 1, 3: 2 },
    );
    expect(plan(tie, seatIds(tie.G).master)[0]).toMatchObject({ args: [1] });
  });

  it('没有存活的盗梦者：不动', () => {
    const s = masterScene({ master: { layer: 2, hand: [] } });
    expect(plan(s, seatIds(s.G).master)).toEqual([]);
  });
});
