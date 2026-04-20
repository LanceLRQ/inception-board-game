// 移形换影强校验测试

import { describe, it, expect } from 'vitest';
import {
  restoreShiftSnapshot,
  validateShiftSnapshot,
  shiftGuardAndRestore,
} from './shift-guard.js';
import { createTestState } from '../../testing/fixtures.js';

describe('restoreShiftSnapshot', () => {
  it('无快照时返回原 state', () => {
    const s = createTestState();
    const result = restoreShiftSnapshot(s);
    expect(result).toBe(s);
  });

  it('还原快照中的角色', () => {
    let s = createTestState();
    // 设 p1 和 p2 被交换
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_joker' },
        p2: { ...s.players.p2!, characterId: 'thief_pointman' },
      },
      shiftSnapshot: {
        p1: 'thief_pointman',
        p2: 'thief_joker',
      },
    };
    const result = restoreShiftSnapshot(s);
    expect(result.players.p1!.characterId).toBe('thief_pointman');
    expect(result.players.p2!.characterId).toBe('thief_joker');
    expect(result.shiftSnapshot).toBeNull();
  });
});

describe('validateShiftSnapshot', () => {
  it('无快照时通过', () => {
    const s = createTestState();
    const { valid, errors } = validateShiftSnapshot(s);
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
  });

  it('合法快照通过', () => {
    let s = createTestState();
    s = {
      ...s,
      shiftSnapshot: {
        p1: 'thief_pointman',
        p2: 'thief_joker',
      },
    };
    const { valid, errors } = validateShiftSnapshot(s);
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
  });

  it('引用不存在的玩家时失败', () => {
    let s = createTestState();
    s = {
      ...s,
      shiftSnapshot: {
        nonexistent: 'thief_pointman',
      },
    };
    const { valid, errors } = validateShiftSnapshot(s);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('快照中玩家不在 playerOrder 时失败', () => {
    let s = createTestState();
    // 创建一个不在 playerOrder 里的玩家
    s = {
      ...s,
      players: {
        ...s.players,
        ghost: { ...s.players.p1!, id: 'ghost' },
      },
      shiftSnapshot: {
        ghost: 'thief_pointman',
      },
    };
    const { valid, errors } = validateShiftSnapshot(s);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('not in playerOrder'))).toBe(true);
  });
});

describe('shiftGuardAndRestore', () => {
  it('合法快照正常还原', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_joker' },
      },
      shiftSnapshot: { p1: 'thief_pointman' },
    };
    const result = shiftGuardAndRestore(s);
    expect(result.players.p1!.characterId).toBe('thief_pointman');
    expect(result.shiftSnapshot).toBeNull();
  });

  it('非法快照仍然还原（防卡死）', () => {
    let s = createTestState();
    s = {
      ...s,
      shiftSnapshot: {
        nonexistent: 'thief_pointman',
      },
    };
    // 即使有错误，也应该还原而不抛异常
    const result = shiftGuardAndRestore(s);
    expect(result.shiftSnapshot).toBeNull();
  });
});
