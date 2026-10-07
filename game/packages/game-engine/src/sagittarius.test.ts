// 射手·禁足+穿心 技能测试
// 对照：docs/manual/05-dream-thieves.md 射手

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { SAGITTARIUS_HEART_LOCK_SKILL_ID } from './engine/skills.js';
import { sendToLimbo, SAGITTARIUS_KILLS_THIS_TURN_KEY } from './engine/death.js';
import { beginTurn } from './moves.js';

/** killed=true：本回合已击杀过一位玩家（穿心的发动前提），其余场景都需要它 */
function setupSagittarius(opts: { killed?: boolean } = {}) {
  const killed = opts.killed ?? true;
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
        characterId: 'thief_sagittarius' as CardID,
        skillUsedThisTurn: killed ? { [SAGITTARIUS_KILLS_THIS_TURN_KEY]: 1 } : {},
        currentLayer: 1,
        hand: ['action_shoot' as CardID, 'action_unlock' as CardID],
      },
      p2: {
        ...s.players.p2!,
        currentLayer: 1,
        hand: ['action_unlock' as CardID, 'action_shift' as CardID],
      },
      pM: { ...s.players.pM!, currentLayer: 1 },
    },
    layers: {
      ...s.layers,
      1: { ...s.layers[1]!, playersInLayer: ['p1', 'p2', 'pM'], heartLockValue: 3 },
    },
  };
  return s;
}

describe('射手·禁足（preventMove）', () => {
  it('preventMove=true + 射手角色 → SHOOT 结果 move 时不移动', () => {
    const s = setupSagittarius();
    // roll=4 → move（非 death faces [1]）
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot', undefined, true], {
      currentPlayer: 'p1',
      rolls: [4],
    });
    expectMoveOk(r);
    // p2 不应移动（留在 L1）
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(1);
  });

  it('preventMove=false → 正常移动', () => {
    const s = setupSagittarius();
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot'], {
      currentPlayer: 'p1',
      rolls: [4],
    });
    expectMoveOk(r);
    // p2 应被移到相邻层 L2
    expect(r.players.p2!.currentLayer).toBe(2);
  });

  it('preventMove=true + 非射手角色 → 忽略 preventMove（正常移动）', () => {
    let s = setupSagittarius();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_architect' as CardID } },
    };
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot', undefined, true], {
      currentPlayer: 'p1',
      rolls: [4],
    });
    expectMoveOk(r);
    // 非射手 → preventMove 被忽略 → p2 正常移动
    expect(r.players.p2!.currentLayer).toBe(2);
  });

  it('preventMove=true + kill → 正常击杀（preventMove 只影响 move 结果）', () => {
    const s = setupSagittarius();
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot', undefined, true], {
      currentPlayer: 'p1',
      rolls: [1], // death
    });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });
});

describe('射手·穿心（useSagittariusHeartLock）', () => {
  it('+1 心锁 → heartLockValue 增加（3 人局 cap=3 默认）', () => {
    let s = setupSagittarius();
    s = {
      ...s,
      layers: { ...s.layers, 1: { ...s.layers[1]!, heartLockValue: 2 } },
    };
    const r = callMove(s, 'useSagittariusHeartLock', [1, 1], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.layers[1]!.heartLockValue).toBe(3);
    // 标记已使用
    expect(r.players.p1!.skillUsedThisTurn[SAGITTARIUS_HEART_LOCK_SKILL_ID]).toBe(1);
  });

  it('-1 心锁 → heartLockValue 减少', () => {
    let s = setupSagittarius();
    s = {
      ...s,
      layers: { ...s.layers, 1: { ...s.layers[1]!, heartLockValue: 3 } },
    };
    const r = callMove(s, 'useSagittariusHeartLock', [1, -1], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.layers[1]!.heartLockValue).toBe(2);
  });

  it('已达上限 → 不变', () => {
    let s = setupSagittarius();
    // 3 人局 cap 默认 3
    s = {
      ...s,
      layers: { ...s.layers, 1: { ...s.layers[1]!, heartLockValue: 3 } },
    };
    const r = callMove(s, 'useSagittariusHeartLock', [1, 1], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.layers[1]!.heartLockValue).toBe(3);
  });

  it('已达下限 0 → 不变', () => {
    let s = setupSagittarius();
    s = {
      ...s,
      layers: { ...s.layers, 1: { ...s.layers[1]!, heartLockValue: 0 } },
    };
    const r = callMove(s, 'useSagittariusHeartLock', [1, -1], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.layers[1]!.heartLockValue).toBe(0);
  });

  it('非射手角色 → INVALID_MOVE', () => {
    let s = setupSagittarius();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_architect' as CardID } },
    };
    const r = callMove(s, 'useSagittariusHeartLock', [1, 1], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('已使用 1 次 → INVALID_MOVE', () => {
    let s = setupSagittarius();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          skillUsedThisTurn: {
            [SAGITTARIUS_KILLS_THIS_TURN_KEY]: 1,
            [SAGITTARIUS_HEART_LOCK_SKILL_ID]: 1,
          },
        },
      },
    };
    const r = callMove(s, 'useSagittariusHeartLock', [1, 1], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非法层号 → INVALID_MOVE', () => {
    const s = setupSagittarius();
    const r = callMove(s, 'useSagittariusHeartLock', [5, 1], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });
});

describe('射手·穿心：每击杀一位玩家才有一次机会（回合限 1 次）', () => {
  // 对照：docs/manual/05-dream-thieves.md 射手 136 行「你每击杀1位玩家，可增加或减少任意一层的1个心锁。回合限1次」
  const killWithShoot = (s: ReturnType<typeof setupSagittarius>) => {
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot'], { currentPlayer: 'p1', rolls: [1] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
    return r;
  };

  it('本回合没有击杀过玩家 → 发动被拒', () => {
    const r = callMove(setupSagittarius({ killed: false }), 'useSagittariusHeartLock', [1, 1], {
      currentPlayer: 'p1',
    });
    expect(r).toBe('INVALID_MOVE');
  });

  it('击杀一次后可以发动一次，第二次被拒', () => {
    const killed = killWithShoot(setupSagittarius({ killed: false }));
    const first = callMove(killed, 'useSagittariusHeartLock', [1, -1], { currentPlayer: 'p1' });
    expectMoveOk(first);
    expect(first.layers[1]!.heartLockValue).toBe(2);
    const second = callMove(first, 'useSagittariusHeartLock', [1, -1], { currentPlayer: 'p1' });
    expect(second).toBe('INVALID_MOVE');
  });

  it('击杀发生在上一回合：新回合开始后不可发动', () => {
    const killed = killWithShoot(setupSagittarius({ killed: false }));
    const nextTurn = beginTurn(killed, 'p1');
    const r = callMove({ ...nextTurn, turnPhase: 'action' }, 'useSagittariusHeartLock', [1, 1], {
      currentPlayer: 'p1',
    });
    expect(r).toBe('INVALID_MOVE');
  });

  it('别人被梦魇送进迷失层不算射手的击杀', () => {
    const limbo = sendToLimbo(setupSagittarius({ killed: false }), 'p2');
    const r = callMove(limbo, 'useSagittariusHeartLock', [1, 1], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });
});
