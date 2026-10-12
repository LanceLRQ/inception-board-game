// 自动行动判定 · Bot 出牌策略（开关、试跑过滤、每回合上限、真人应答）

import { describe, it, expect } from 'vitest';
import { applyMove } from '@icgame/game-engine/runner';
import { nextAutoAction } from './autoAction.js';
import { actionScene, game, seatIds, type State } from './playScene.js';

function unlockScene(): { s: State; bot: string; others: string[] } {
  const s = actionScene({
    actor: 0,
    seats: {
      t0: { layer: 2, hand: ['action_unlock', 'action_creation'] },
      t1: { layer: 2, hand: ['action_unlock'] },
      master: { layer: 3, hand: [] },
    },
  });
  const { thieves } = seatIds(s.G);
  return { s, bot: thieves[0]!, others: s.G.playerOrder.filter((id) => id !== thieves[0]) };
}

describe('nextAutoAction · Bot 出牌策略', () => {
  it('开关缺省关闭：行动阶段只结束出牌', () => {
    const { s, bot } = unlockScene();
    expect(nextAutoAction(s, { humanPlayerIDs: [] })).toMatchObject({
      playerID: bot,
      move: 'endActionPhase',
    });
    expect(nextAutoAction(s, { humanPlayerIDs: [], policySeatIDs: [] })?.move).toBe(
      'endActionPhase',
    );
  });

  it('打开后在能解封的局面发 playUnlock，且被运行器接受', () => {
    const { s, bot } = unlockScene();
    const action = nextAutoAction(s, { humanPlayerIDs: [], policySeatIDs: [bot] });
    expect(action).toMatchObject({ playerID: bot, move: 'playUnlock', args: ['action_unlock'] });
    expect(action?.why).toContain('解封');
    expect(applyMove(game, s, action!).ok).toBe(true);
  });

  it('候选全被运行器拒绝时回到 endActionPhase', () => {
    const { s, bot } = unlockScene();
    // 手里只有解封，但本回合已经成功解封过：引擎拒绝
    const blocked: State = {
      ...s,
      G: {
        ...s.G,
        players: {
          ...s.G.players,
          [bot]: { ...s.G.players[bot]!, hand: ['action_unlock'], successfulUnlocksThisTurn: 1 },
        },
        unlockThisTurn: 1,
      },
    };
    const probe = applyMove(game, blocked, {
      playerID: bot,
      move: 'playUnlock',
      args: ['action_unlock'],
    });
    expect(probe.ok).toBe(false);
    expect(nextAutoAction(blocked, { humanPlayerIDs: [], policySeatIDs: [bot] })?.move).toBe(
      'endActionPhase',
    );
  });

  it('前一个候选被拒时取下一个被接受的', () => {
    const { s, bot } = unlockScene();
    const blocked: State = {
      ...s,
      G: {
        ...s.G,
        players: {
          ...s.G.players,
          [bot]: { ...s.G.players[bot]!, successfulUnlocksThisTurn: 1 },
        },
        unlockThisTurn: 1,
      },
    };
    const action = nextAutoAction(blocked, { humanPlayerIDs: [], policySeatIDs: [bot] });
    // 解封被拒，凭空造物被接受
    expect(action?.move).toBe('playCreation');
  });

  it('本回合已打出的牌达到上限后结束出牌阶段', () => {
    const { s, bot } = unlockScene();
    const capped: State = {
      ...s,
      G: { ...s.G, playedCardsThisTurn: Array(4).fill('action_kick') as never },
    };
    expect(nextAutoAction(capped, { humanPlayerIDs: [], policySeatIDs: [bot] })?.move).toBe(
      'endActionPhase',
    );
    const three: State = {
      ...capped,
      G: {
        ...capped.G,
        playedCardsThisTurn: ['action_kick', 'action_kick', 'action_kick'] as never,
      },
    };
    expect(nextAutoAction(three, { humanPlayerIDs: [], policySeatIDs: [bot] })?.move).toBe(
      'playUnlock',
    );
    const custom = nextAutoAction(three, {
      humanPlayerIDs: [],
      policySeatIDs: [bot],
      maxPlaysPerTurn: 3,
    });
    expect(custom?.move).toBe('endActionPhase');
  });

  it('真人座位不出牌（等真人），未列入的座位只结束出牌阶段', () => {
    const { s, bot, others } = unlockScene();
    expect(nextAutoAction(s, { humanPlayerIDs: [bot], policySeatIDs: [bot] })).toBeNull();
    expect(nextAutoAction(s, { humanPlayerIDs: [], policySeatIDs: [others[0]!] })?.move).toBe(
      'endActionPhase',
    );
  });

  it('Bot 出牌后：真人该应答时返回 null，Bot 应答者继续放弃', () => {
    const { s, bot, others } = unlockScene();
    const played = applyMove(
      game,
      s,
      nextAutoAction(s, { humanPlayerIDs: [], policySeatIDs: [bot] })!,
    );
    if (!played.ok) throw new Error('playUnlock 被拒绝');
    const window = played.state.G.pendingResponseWindow;
    expect(window).not.toBeNull();
    const first = window!.responders[0]!;
    expect(
      nextAutoAction(played.state, { humanPlayerIDs: [first], policySeatIDs: [bot] }),
    ).toBeNull();
    expect(
      nextAutoAction(played.state, { humanPlayerIDs: [], policySeatIDs: [bot] }),
    ).toMatchObject({ playerID: first, move: 'passResponse' });
    expect(others).toContain(first);
  });

  it('梦主 Bot 与盗梦者同层：对其出 SHOOT', () => {
    const s = actionScene({
      actor: 'master',
      seats: {
        master: { layer: 2, hand: ['action_shoot'] },
        t0: { layer: 2, hand: [] },
      },
    });
    const { master, thieves } = seatIds(s.G);
    const action = nextAutoAction(s, { humanPlayerIDs: [], policySeatIDs: [master] });
    expect(action).toMatchObject({
      playerID: master,
      move: 'playShoot',
      args: [thieves[0], 'action_shoot'],
    });
  });

  it('待结算的挑选优先于出牌策略（SHOOT 判定为移动，发动方选层）', () => {
    const s = actionScene({
      actor: 0,
      seats: { t0: { layer: 2, hand: ['action_unlock'] }, master: { layer: 3, hand: [] } },
    });
    const { thieves, master } = seatIds(s.G);
    const pending: State = {
      ...s,
      G: {
        ...s.G,
        pendingShootMove: {
          shooterID: thieves[0]!,
          targetPlayerID: master,
          cardId: null,
          extraOnMove: null,
          choices: [2, 4],
        } as never,
      },
    };
    expect(
      nextAutoAction(pending, { humanPlayerIDs: [], policySeatIDs: [thieves[0]!] })?.move,
    ).toBe('resolveShootMove');
  });
});

describe('nextAutoAction · Bot 应答策略', () => {
  /** t0 打出解封，窗口打开；梦主与 t1 手里都有解封 */
  function openWindow(masterHand = ['action_unlock']): {
    s: State;
    master: string;
    t0: string;
    t1: string;
  } {
    const base = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 2, hand: ['action_unlock'] },
        t1: { layer: 2, hand: ['action_unlock'] },
        master: { layer: 3, hand: masterHand },
      },
    });
    const { master, thieves } = seatIds(base.G);
    const r = applyMove(game, base, {
      playerID: thieves[0]!,
      move: 'playUnlock',
      args: ['action_unlock'],
    });
    if (!r.ok) throw new Error('playUnlock 被拒绝');
    return { s: r.state, master, t0: thieves[0]!, t1: thieves[1]! };
  }

  it('开关缺省关闭：Bot 响应者一律放弃', () => {
    const { s } = openWindow();
    const first = s.G.pendingResponseWindow!.responders[0]!;
    expect(nextAutoAction(s, { humanPlayerIDs: [] })).toMatchObject({
      playerID: first,
      move: 'passResponse',
    });
  });

  it('打开后：轮到 Bot 梦主时抵消盗梦者的解封，轮到同阵营的 Bot 盗梦者时放弃', () => {
    const { s, master, t1 } = openWindow();
    const opts = { humanPlayerIDs: [], policySeatIDs: s.G.playerOrder };
    let state = s;
    const seen: Record<string, string> = {};
    for (let i = 0; i < 6 && state.G.pendingResponseWindow; i++) {
      const a = nextAutoAction(state, opts)!;
      seen[a.playerID] = a.move;
      const r = applyMove(game, state, a);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      state = r.state;
      if (a.move === 'respondCancelUnlock') break;
    }
    expect(seen[t1] ?? 'passResponse').toBe('passResponse');
    expect(seen[master] ?? 'respondCancelUnlock').toBe('respondCancelUnlock');
  });

  it('梦主响应者直接被点到时发 respondCancelUnlock，且被运行器接受', () => {
    const { s, master } = openWindow();
    // 让梦主成为下一个响应者：其余人都已响应
    const w = s.G.pendingResponseWindow!;
    const others = w.responders.filter((id) => id !== master);
    const only: State = {
      ...s,
      G: { ...s.G, pendingResponseWindow: { ...w, responded: others } },
    };
    const a = nextAutoAction(only, { humanPlayerIDs: [], policySeatIDs: [master] });
    expect(a).toMatchObject({ playerID: master, move: 'respondCancelUnlock' });
    expect(applyMove(game, only, a!).ok).toBe(true);
    // 开关里没有梦主：放弃
    expect(nextAutoAction(only, { humanPlayerIDs: [], policySeatIDs: [] })?.move).toBe(
      'passResponse',
    );
  });

  it('候选被运行器拒绝时回到放弃', () => {
    const { s, master } = openWindow();
    const w = s.G.pendingResponseWindow!;
    const only: State = {
      ...s,
      G: {
        ...s.G,
        // 窗口来源不是解封效果①：抵消会被引擎拒绝，策略也不给候选 -> 放弃
        pendingResponseWindow: {
          ...w,
          responded: w.responders.filter((id) => id !== master),
        },
        pendingUnlock: null,
      },
    };
    expect(nextAutoAction(only, { humanPlayerIDs: [], policySeatIDs: [master] })?.move).toBe(
      'passResponse',
    );
  });

  it('真人响应者仍然等真人', () => {
    const { s, master } = openWindow();
    const w = s.G.pendingResponseWindow!;
    const only: State = {
      ...s,
      G: {
        ...s.G,
        pendingResponseWindow: { ...w, responded: w.responders.filter((id) => id !== master) },
      },
    };
    expect(nextAutoAction(only, { humanPlayerIDs: [master], policySeatIDs: [master] })).toBeNull();
  });

  describe('土星·律令', () => {
    function decree(masterHand: string[]): { s: State; master: string } {
      const base = actionScene({
        actor: 0,
        saturn: true,
        seats: {
          t0: { layer: 2, hand: ['action_kick'] },
          t1: { layer: 2, hand: [] },
          master: { layer: 3, hand: masterHand },
        },
      });
      const { master, thieves } = seatIds(base.G);
      const r = applyMove(game, base, {
        playerID: thieves[0]!,
        move: 'playKick',
        args: ['action_kick', thieves[1]!],
      });
      if (!r.ok) throw new Error('playKick 被拒绝');
      return { s: r.state, master };
    }

    it('开关缺省关闭：梦主放过', () => {
      const { s, master } = decree(['action_kick']);
      expect(nextAutoAction(s, { humanPlayerIDs: [] })).toMatchObject({
        playerID: master,
        move: 'respondSaturnDecree',
        args: [null],
      });
    });

    it('打开后：Bot 梦主有同名牌就弃牌抵消，没有就放过', () => {
      const { s, master } = decree(['action_kick', 'action_unlock']);
      const a = nextAutoAction(s, { humanPlayerIDs: [], policySeatIDs: [master] });
      expect(a).toMatchObject({
        playerID: master,
        move: 'respondSaturnDecree',
        args: ['action_kick'],
      });
      expect(applyMove(game, s, a!).ok).toBe(true);

      const none = decree(['action_unlock']);
      expect(
        nextAutoAction(none.s, { humanPlayerIDs: [], policySeatIDs: [none.master] }),
      ).toMatchObject({ move: 'respondSaturnDecree', args: [null] });
    });

    it('真人梦主仍等真人', () => {
      const { s, master } = decree(['action_kick']);
      expect(nextAutoAction(s, { humanPlayerIDs: [master], policySeatIDs: [master] })).toBeNull();
    });
  });
});

describe('nextAutoAction · 复活与梦主移动', () => {
  const on = (ids: string[]) => ({ humanPlayerIDs: [] as string[], policySeatIDs: ids });

  it('迷失层的 Bot 在出牌阶段复活自己；开关关闭时只结束出牌阶段', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 1, hand: ['action_kick', 'action_graft', 'action_unlock'], limbo: true },
        master: { layer: 2, hand: [] },
      },
    });
    const bot = seatIds(s.G).thieves[0]!;
    const a = nextAutoAction(s, on([bot]));
    expect(a).toMatchObject({
      playerID: bot,
      move: 'playRevive',
      args: [null, ['action_kick', 'action_graft']],
    });
    expect(applyMove(game, s, a!).ok).toBe(true);
    expect(nextAutoAction(s, { humanPlayerIDs: [] })?.move).toBe('endActionPhase');
  });

  it('迷失层手牌不够：结束出牌阶段', () => {
    const s = actionScene({
      actor: 0,
      seats: {
        t0: { layer: 1, hand: ['action_kick'], limbo: true },
        master: { layer: 2, hand: [] },
      },
    });
    const bot = seatIds(s.G).thieves[0]!;
    expect(nextAutoAction(s, on([bot]))?.move).toBe('endActionPhase');
  });

  it('梦主 Bot 先发 dreamMasterMove，被引擎拒绝（本回合已移动）后不再重复，转而结束出牌', () => {
    const s = actionScene({
      actor: 'master',
      rest: 'limbo',
      seats: { master: { layer: 1, hand: [] }, t0: { layer: 4, hand: [] } },
    });
    const master = seatIds(s.G).master;
    const first = nextAutoAction(s, on([master]));
    expect(first).toMatchObject({ playerID: master, move: 'dreamMasterMove', args: [2] });
    const moved = applyMove(game, s, first!);
    if (!moved.ok) throw new Error('移动被拒绝');
    expect(nextAutoAction(moved.state, on([master]))?.move).toBe('endActionPhase');
    expect(nextAutoAction(s, { humanPlayerIDs: [] })?.move).toBe('endActionPhase');
  });

  it('梦主移动到盗梦者所在层后，同一回合接着出牌', () => {
    const s = actionScene({
      actor: 'master',
      rest: 'limbo',
      seats: { master: { layer: 2, hand: ['action_shoot'] }, t0: { layer: 3, hand: [] } },
    });
    const master = seatIds(s.G).master;
    const first = nextAutoAction(s, on([master]))!;
    expect(first.move).toBe('dreamMasterMove');
    const moved = applyMove(game, s, first);
    if (!moved.ok) throw new Error('移动被拒绝');
    expect(nextAutoAction(moved.state, on([master]))?.move).toBe('playShoot');
  });
});
