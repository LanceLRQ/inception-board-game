// 技能使用计数器测试

import { describe, it, expect } from 'vitest';
import { getUsageCount, canUse, incrementUsage, resetTurnUsage } from './usage-counter.js';
import { createTestState } from '../../testing/fixtures.js';

describe('getUsageCount', () => {
  it('无使用记录时返回 0', () => {
    const s = createTestState();
    expect(
      getUsageCount(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'perTurn' }, 'action'),
    ).toBe(0);
  });

  it('读取 perTurn 计数', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { skill_a: 2 } },
      },
    };
    expect(
      getUsageCount(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'perTurn' }, 'action'),
    ).toBe(2);
  });

  it('读取 perPhase 计数', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { 'skill_a:action': 1 } },
      },
    };
    expect(
      getUsageCount(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'perPhase' }, 'action'),
    ).toBe(1);
  });

  it('perPhase 不同阶段独立计数', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { 'skill_a:action': 3 } },
      },
    };
    // draw 阶段的计数为 0
    expect(
      getUsageCount(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'perPhase' }, 'draw'),
    ).toBe(0);
  });

  it('读取 perGame 计数', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisGame: { skill_a: 5 } },
      },
    };
    expect(
      getUsageCount(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'perGame' }, 'action'),
    ).toBe(5);
  });

  it('passive 始终返回 0', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          skillUsedThisTurn: { skill_a: 99 },
          skillUsedThisGame: { skill_a: 99 },
        },
      },
    };
    expect(
      getUsageCount(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'passive' }, 'action'),
    ).toBe(0);
  });
});

describe('canUse', () => {
  it('passive 始终可用', () => {
    const s = createTestState();
    expect(canUse(s, { playerID: 'p1', abilityID: 'x', scope: 'passive' }, 0, 'action')).toBe(true);
  });

  it('无 limit 时始终可用', () => {
    const s = createTestState();
    expect(
      canUse(s, { playerID: 'p1', abilityID: 'x', scope: 'perTurn' }, undefined, 'action'),
    ).toBe(true);
  });

  it('未达限制时可用', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { x: 1 } },
      },
    };
    expect(canUse(s, { playerID: 'p1', abilityID: 'x', scope: 'perTurn' }, 2, 'action')).toBe(true);
  });

  it('达到限制时不可用', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { x: 2 } },
      },
    };
    expect(canUse(s, { playerID: 'p1', abilityID: 'x', scope: 'perTurn' }, 2, 'action')).toBe(
      false,
    );
  });
});

describe('incrementUsage', () => {
  it('perTurn 同时递增 turn 和 game 计数', () => {
    let s = createTestState();
    s = incrementUsage(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'perTurn' }, 'action');
    expect(s.players.p1!.skillUsedThisTurn.skill_a).toBe(1);
    expect(s.players.p1!.skillUsedThisGame.skill_a).toBe(1);

    s = incrementUsage(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'perTurn' }, 'action');
    expect(s.players.p1!.skillUsedThisTurn.skill_a).toBe(2);
    expect(s.players.p1!.skillUsedThisGame.skill_a).toBe(2);
  });

  it('perPhase 用 phase key 存储', () => {
    let s = createTestState();
    s = incrementUsage(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'perPhase' }, 'action');
    expect(s.players.p1!.skillUsedThisTurn['skill_a:action']).toBe(1);
    expect(s.players.p1!.skillUsedThisGame.skill_a).toBe(1);
  });

  it('perGame 只递增 game 计数', () => {
    let s = createTestState();
    s = incrementUsage(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'perGame' }, 'action');
    expect(s.players.p1!.skillUsedThisTurn.skill_a).toBeUndefined();
    expect(s.players.p1!.skillUsedThisGame.skill_a).toBe(1);
  });

  it('passive 不递增', () => {
    let s = createTestState();
    s = incrementUsage(s, { playerID: 'p1', abilityID: 'skill_a', scope: 'passive' }, 'action');
    expect(s.players.p1!.skillUsedThisTurn.skill_a).toBeUndefined();
    expect(s.players.p1!.skillUsedThisGame.skill_a).toBeUndefined();
  });
});

describe('resetTurnUsage', () => {
  it('清空 skillUsedThisTurn 但保留 skillUsedThisGame', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          skillUsedThisTurn: { skill_a: 3, 'skill_b:action': 1 },
          skillUsedThisGame: { skill_a: 5, skill_b: 2 },
        },
      },
    };
    s = resetTurnUsage(s, 'p1');
    expect(s.players.p1!.skillUsedThisTurn).toEqual({});
    expect(s.players.p1!.skillUsedThisGame).toEqual({ skill_a: 5, skill_b: 2 });
  });
});
