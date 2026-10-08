// 格林射线·缉捕 move 测试
// 对照：docs/manual/05-dream-thieves.md 格林射线

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';

function setupGreenRay() {
  let s = scenarioStartOfGame3p();
  s = {
    ...s,
    turnPhase: 'action',
    currentPlayerID: 'p1',
    turnNumber: 3,
    players: {
      ...s.players,
      p1: {
        ...s.players.p1!,
        characterId: 'thief_green_ray' as CardID,
        currentLayer: 1,
        hand: ['action_dream_transit' as CardID, 'action_shoot' as CardID],
      },
      p2: {
        ...s.players.p2!,
        currentLayer: 4,
      },
      pM: {
        ...s.players.pM!,
        currentLayer: 1,
      },
    },
    layers: {
      ...s.layers,
      1: { ...s.layers[1]!, playersInLayer: ['p1', 'pM'] },
      4: { ...s.layers[4]!, playersInLayer: ['p2'] },
    },
  };
  return s;
}

describe('playGreenRayArrest move', () => {
  it('格林射线 弃穿梭剂+SHOOT → 移到目标层 → SHOOT 结算', () => {
    const s = setupGreenRay();
    // p1(L1) 用穿梭剂+SHOOT → 移到 L4 → SHOOT p2(L4)
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expectMoveOk(r);
    // p1 已移到 L4
    expect(r.players.p1!.currentLayer).toBe(4);
    // 穿梭剂已弃
    expect(r.players.p1!.hand).not.toContain('action_dream_transit');
    // SHOOT 已弃（applyShootVariant 处理）
    expect(r.players.p1!.hand).not.toContain('action_shoot');
    // playedCardsThisTurn 记录
    expect(r.playedCardsThisTurn).toContain('action_shoot');
  });

  it('非格林射线角色 → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_architect' as CardID } },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('手牌无穿梭剂 → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, hand: ['action_shoot' as CardID] } },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('手牌无 SHOOT → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, hand: ['action_dream_transit' as CardID] } },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非 draw 阶段（draw 阶段） → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = { ...s, turnPhase: 'draw' };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('目标是自己 → INVALID_MOVE', () => {
    const s = setupGreenRay();
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p1', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('目标已死亡 → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = { ...s, players: { ...s.players, p2: { ...s.players.p2!, isAlive: false } } };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('使用 SHOOT·刺客之王 → 正确结算（跨层无限制）', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          hand: ['action_dream_transit' as CardID, 'action_shoot_assassin' as CardID],
        },
      },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot_assassin', 'p2', 4], {
      currentPlayer: 'p1',
    });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(4);
    expect(r.playedCardsThisTurn).toContain('action_shoot_assassin');
  });

  it('使用 SHOOT·爆甲螺旋 → 正确结算', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          hand: ['action_dream_transit' as CardID, 'action_shoot_burst' as CardID],
        },
        p2: {
          ...s.players.p2!,
          hand: ['action_shoot' as CardID, 'action_unlock' as CardID],
        },
      },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot_burst', 'p2', 4], {
      currentPlayer: 'p1',
    });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(4);
  });

  it('moveCounter 递增', () => {
    const s = setupGreenRay();
    const before = s.moveCounter;
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.moveCounter).toBe(before + 1);
  });
});

// 卡面：「若你弃掉1张【梦境穿梭剂】和1张SHOOT类牌，可移动到任意一层梦境，然后可执行该SHOOT类牌的效果」。
// 移动与射击各自可选：可以只移动、只射击，两样都不做则不能发动；代价（弃一张穿梭剂和一张 SHOOT 类牌）不变。
// 对照：docs/manual/04-action-cards.md 梦境穿梭剂、SHOOT；卡面见角色牌「缉捕」
describe('playGreenRayArrest：移动与射击各自可选', () => {
  const TRANSIT = 'action_dream_transit' as CardID;
  const SHOOT = 'action_shoot' as CardID;

  it('只移动：弃穿梭剂和 SHOOT 作为代价，移到目标层，不射击', () => {
    const s = setupGreenRay();
    const r = callMove(s, 'playGreenRayArrest', [SHOOT, null, 3], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(3);
    expect(r.players.p1!.hand).toEqual([]);
    expect(r.deck.discardPile).toEqual(expect.arrayContaining([TRANSIT, SHOOT]));
    // 没有射击：目标毫发无伤，也没有骰子结果
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.lastShootRoll).toBe(s.lastShootRoll);
    // SHOOT 只是代价，没有被打出
    expect(r.playedCardsThisTurn).not.toContain(SHOOT);
    expect(r.moveCounter).toBe(s.moveCounter + 1);
  });

  it('只移动：目标参数省略（不传）同样可以', () => {
    const s = setupGreenRay();
    const r = callMove(s, 'playGreenRayArrest', [SHOOT, undefined, 2], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(2);
    expect(r.layers[2]!.playersInLayer).toContain('p1');
    expect(r.layers[1]!.playersInLayer).not.toContain('p1');
  });

  it('只射击（不移动）：层参数省略，留在原层对同层目标射击', () => {
    const s = setupGreenRay();
    const r = callMove(s, 'playGreenRayArrest', [SHOOT, 'pM'], { currentPlayer: 'p1', rolls: [1] });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(1);
    expect(r.players.pM!.isAlive).toBe(false);
    expect(r.players.p1!.hand).toEqual([]);
    expect(r.deck.discardPile).toEqual(expect.arrayContaining([TRANSIT, SHOOT]));
    expect(r.playedCardsThisTurn).toContain(SHOOT);
  });

  it('只射击：层参数等于当前所在层同样算不移动', () => {
    const s = setupGreenRay();
    const r = callMove(s, 'playGreenRayArrest', [SHOOT, 'pM', 1], {
      currentPlayer: 'p1',
      rolls: [1],
    });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(1);
    expect(r.players.pM!.isAlive).toBe(false);
  });

  it('只射击：目标不在同层时按这张 SHOOT 的层数限制被拒绝', () => {
    const s = setupGreenRay();
    expect(callMove(s, 'playGreenRayArrest', [SHOOT, 'p2'], { currentPlayer: 'p1' })).toBe(
      'INVALID_MOVE',
    );
  });

  it('移动并射击（原有用法）仍然可用', () => {
    const s = setupGreenRay();
    const r = callMove(s, 'playGreenRayArrest', [SHOOT, 'p2', 4], {
      currentPlayer: 'p1',
      rolls: [1],
    });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(4);
    expect(r.players.p2!.isAlive).toBe(false);
  });

  it('两样都不做（不移动也不射击）被拒绝，什么都不弃', () => {
    const s = setupGreenRay();
    for (const args of [
      [SHOOT],
      [SHOOT, null, null],
      [SHOOT, undefined, undefined],
      [SHOOT, null, 1], // 留在原层且不射击
    ]) {
      expect(
        callMove(s, 'playGreenRayArrest', args, { currentPlayer: 'p1' }),
        JSON.stringify(args),
      ).toBe('INVALID_MOVE');
    }
  });

  it('给了目标就必须是合法目标：自己、死亡玩家、不存在的玩家都被拒绝', () => {
    const s = setupGreenRay();
    expect(callMove(s, 'playGreenRayArrest', [SHOOT, 'p1', 4], { currentPlayer: 'p1' })).toBe(
      'INVALID_MOVE',
    );
    const dead = { ...s, players: { ...s.players, p2: { ...s.players.p2!, isAlive: false } } };
    expect(callMove(dead, 'playGreenRayArrest', [SHOOT, 'p2', 4], { currentPlayer: 'p1' })).toBe(
      'INVALID_MOVE',
    );
    expect(callMove(s, 'playGreenRayArrest', [SHOOT, 'nobody', 4], { currentPlayer: 'p1' })).toBe(
      'INVALID_MOVE',
    );
  });

  it('给了层就必须是 1-4 的整数', () => {
    const s = setupGreenRay();
    for (const layer of [0, 5, -1, 2.5, '3']) {
      expect(
        callMove(s, 'playGreenRayArrest', [SHOOT, null, layer], { currentPlayer: 'p1' }),
        String(layer),
      ).toBe('INVALID_MOVE');
    }
  });

  it('只移动时代价照付：缺穿梭剂或缺 SHOOT 类牌都不能发动', () => {
    const s = setupGreenRay();
    const noTransit = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, hand: [SHOOT] } },
    };
    expect(
      callMove(noTransit, 'playGreenRayArrest', [SHOOT, null, 3], { currentPlayer: 'p1' }),
    ).toBe('INVALID_MOVE');
    const noShoot = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, hand: [TRANSIT] } },
    };
    expect(callMove(noShoot, 'playGreenRayArrest', [SHOOT, null, 3], { currentPlayer: 'p1' })).toBe(
      'INVALID_MOVE',
    );
    // 代价牌必须是 SHOOT 类牌
    const notShootCard = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, hand: [TRANSIT, 'action_kick' as CardID] },
      },
    };
    expect(
      callMove(notShootCard, 'playGreenRayArrest', ['action_kick', null, 3], {
        currentPlayer: 'p1',
      }),
    ).toBe('INVALID_MOVE');
  });

  it('非出牌阶段、非格林射线、非回合主人仍然被拒绝（只移动也一样）', () => {
    const s = setupGreenRay();
    expect(
      callMove({ ...s, turnPhase: 'discard' }, 'playGreenRayArrest', [SHOOT, null, 3], {
        currentPlayer: 'p1',
      }),
    ).toBe('INVALID_MOVE');
    expect(callMove(s, 'playGreenRayArrest', [SHOOT, null, 3], { currentPlayer: 'p2' })).toBe(
      'INVALID_MOVE',
    );
  });
});
