// 双面角色测试

import { describe, it, expect } from 'vitest';
import {
  isDualFaced,
  getFlippedId,
  flipCharacter,
  flipCharacters,
  getDualFacedConfig,
} from './dual-faced.js';
import { createTestState } from '../../testing/fixtures.js';

describe('isDualFaced', () => {
  it('双面角色返回 true', () => {
    expect(isDualFaced('thief_gemini')).toBe(true);
    expect(isDualFaced('thief_gemini_back')).toBe(true);
    expect(isDualFaced('thief_pisces')).toBe(true);
    expect(isDualFaced('thief_luna_back')).toBe(true);
  });

  it('普通角色返回 false', () => {
    expect(isDualFaced('thief_pointman')).toBe(false);
    expect(isDualFaced('dm_fortress')).toBe(false);
  });
});

describe('getFlippedId', () => {
  it('正面翻到背面', () => {
    expect(getFlippedId('thief_gemini')).toBe('thief_gemini_back');
  });

  it('背面翻到正面', () => {
    expect(getFlippedId('thief_gemini_back')).toBe('thief_gemini');
  });

  it('非双面角色返回 null', () => {
    expect(getFlippedId('thief_pointman')).toBeNull();
  });
});

describe('getDualFacedConfig', () => {
  it('通过正面 ID 查找', () => {
    const config = getDualFacedConfig('thief_gemini');
    expect(config).toBeDefined();
    expect(config!.frontId).toBe('thief_gemini');
    expect(config!.backId).toBe('thief_gemini_back');
  });

  it('通过背面 ID 查找', () => {
    const config = getDualFacedConfig('thief_pisces_back');
    expect(config).toBeDefined();
    expect(config!.frontId).toBe('thief_pisces');
  });

  it('未知 ID 返回 undefined', () => {
    expect(getDualFacedConfig('thief_joker')).toBeUndefined();
  });
});

describe('flipCharacter', () => {
  it('双面角色翻面成功', () => {
    let s = createTestState();
    // 设 p1 为双子正面
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_gemini' },
      },
    };
    const next = flipCharacter(s, 'p1');
    expect(next.players.p1!.characterId).toBe('thief_gemini_back');
    // 不修改原 state
    expect(s.players.p1!.characterId).toBe('thief_gemini');
  });

  it('再次翻面恢复正面', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_gemini' },
      },
    };
    s = flipCharacter(s, 'p1');
    expect(s.players.p1!.characterId).toBe('thief_gemini_back');
    s = flipCharacter(s, 'p1');
    expect(s.players.p1!.characterId).toBe('thief_gemini');
  });

  it('非双面角色不变', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_pointman' },
      },
    };
    const next = flipCharacter(s, 'p1');
    expect(next.players.p1!.characterId).toBe('thief_pointman');
  });

  it('不存在的玩家不变', () => {
    const s = createTestState();
    const next = flipCharacter(s, 'nonexistent');
    expect(next).toBe(s);
  });
});

describe('flipCharacters', () => {
  it('批量翻面', () => {
    let s = createTestState();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_gemini' },
        p2: { ...s.players.p2!, characterId: 'thief_pisces' },
      },
    };
    const next = flipCharacters(s, ['p1', 'p2']);
    expect(next.players.p1!.characterId).toBe('thief_gemini_back');
    expect(next.players.p2!.characterId).toBe('thief_pisces_back');
  });
});
