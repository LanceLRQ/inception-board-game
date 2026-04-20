// 射手·禁足+穿心 技能测试
// 对照：docs/manual/05-dream-thieves.md 射手

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { SAGITTARIUS_HEART_LOCK_SKILL_ID } from './engine/skills.js';

function setupSagittarius() {
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
        p1: { ...s.players.p1!, skillUsedThisTurn: { [SAGITTARIUS_HEART_LOCK_SKILL_ID]: 1 } },
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
