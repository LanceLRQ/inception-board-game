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
    expect(nextAutoAction(s, { humanPlayerIDs: [], cardPlaySeatIDs: [] })?.move).toBe(
      'endActionPhase',
    );
  });

  it('打开后在能解封的局面发 playUnlock，且被运行器接受', () => {
    const { s, bot } = unlockScene();
    const action = nextAutoAction(s, { humanPlayerIDs: [], cardPlaySeatIDs: [bot] });
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
    expect(nextAutoAction(blocked, { humanPlayerIDs: [], cardPlaySeatIDs: [bot] })?.move).toBe(
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
    const action = nextAutoAction(blocked, { humanPlayerIDs: [], cardPlaySeatIDs: [bot] });
    // 解封被拒，凭空造物被接受
    expect(action?.move).toBe('playCreation');
  });

  it('本回合已打出的牌达到上限后结束出牌阶段', () => {
    const { s, bot } = unlockScene();
    const capped: State = {
      ...s,
      G: { ...s.G, playedCardsThisTurn: Array(4).fill('action_kick') as never },
    };
    expect(nextAutoAction(capped, { humanPlayerIDs: [], cardPlaySeatIDs: [bot] })?.move).toBe(
      'endActionPhase',
    );
    const three: State = {
      ...capped,
      G: {
        ...capped.G,
        playedCardsThisTurn: ['action_kick', 'action_kick', 'action_kick'] as never,
      },
    };
    expect(nextAutoAction(three, { humanPlayerIDs: [], cardPlaySeatIDs: [bot] })?.move).toBe(
      'playUnlock',
    );
    const custom = nextAutoAction(three, {
      humanPlayerIDs: [],
      cardPlaySeatIDs: [bot],
      maxPlaysPerTurn: 3,
    });
    expect(custom?.move).toBe('endActionPhase');
  });

  it('真人座位不出牌（等真人），未列入的座位只结束出牌阶段', () => {
    const { s, bot, others } = unlockScene();
    expect(nextAutoAction(s, { humanPlayerIDs: [bot], cardPlaySeatIDs: [bot] })).toBeNull();
    expect(nextAutoAction(s, { humanPlayerIDs: [], cardPlaySeatIDs: [others[0]!] })?.move).toBe(
      'endActionPhase',
    );
  });

  it('Bot 出牌后：真人该应答时返回 null，Bot 应答者继续放弃', () => {
    const { s, bot, others } = unlockScene();
    const played = applyMove(
      game,
      s,
      nextAutoAction(s, { humanPlayerIDs: [], cardPlaySeatIDs: [bot] })!,
    );
    if (!played.ok) throw new Error('playUnlock 被拒绝');
    const window = played.state.G.pendingResponseWindow;
    expect(window).not.toBeNull();
    const first = window!.responders[0]!;
    expect(
      nextAutoAction(played.state, { humanPlayerIDs: [first], cardPlaySeatIDs: [bot] }),
    ).toBeNull();
    expect(
      nextAutoAction(played.state, { humanPlayerIDs: [], cardPlaySeatIDs: [bot] }),
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
    const action = nextAutoAction(s, { humanPlayerIDs: [], cardPlaySeatIDs: [master] });
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
      nextAutoAction(pending, { humanPlayerIDs: [], cardPlaySeatIDs: [thieves[0]!] })?.move,
    ).toBe('resolveShootMove');
  });
});
