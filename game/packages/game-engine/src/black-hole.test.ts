// 黑洞·吞噬+吸纳 技能测试
// 对照：docs/manual/05-dream-thieves.md 黑洞

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { BLACK_HOLE_LEVY_SKILL_ID, BLACK_HOLE_ABSORB_SKILL_ID } from './engine/skills.js';

function setupBlackHole() {
  let s = scenarioStartOfGame3p();
  s = {
    ...s,
    turnPhase: 'draw',
    currentPlayerID: 'p1',
    players: {
      ...s.players,
      p1: {
        ...s.players.p1!,
        characterId: 'thief_black_hole' as CardID,
        currentLayer: 1,
        hand: [],
      },
      p2: {
        ...s.players.p2!,
        currentLayer: 1,
        hand: ['action_unlock' as CardID, 'action_shoot' as CardID],
      },
      pM: { ...s.players.pM!, currentLayer: 1, hand: ['action_kick' as CardID] },
    },
    layers: {
      ...s.layers,
      1: { ...s.layers[1]!, playersInLayer: ['p1', 'p2', 'pM'], heartLockValue: 3 },
    },
  };
  return s;
}

describe('黑洞·吞噬（playBlackHoleLevy）', () => {
  it('同层 p2+pM 各给 1 张 → p1 收到 2 张', () => {
    const s = setupBlackHole();
    const before = s.players.p1!.hand.length;
    const picks: Record<string, CardID> = {
      p2: 'action_unlock',
      pM: 'action_kick',
    };
    const r = callMove(s, 'playBlackHoleLevy', [picks], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p1!.hand.length).toBe(before + 2);
    expect(r.players.p1!.hand).toContain('action_unlock');
    expect(r.players.p1!.hand).toContain('action_kick');
    expect(r.players.p2!.hand).not.toContain('action_unlock');
    expect(r.players.pM!.hand).not.toContain('action_kick');
  });

  it('只给部分玩家牌 → INVALID_MOVE', () => {
    const s = setupBlackHole();
    const picks: Record<string, CardID> = { p2: 'action_unlock' };
    const r = callMove(s, 'playBlackHoleLevy', [picks], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非黑洞角色 → INVALID_MOVE', () => {
    let s = setupBlackHole();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_architect' as CardID } },
    };
    const r = callMove(s, 'playBlackHoleLevy', [{ p2: 'action_unlock' }], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('黑洞已死亡 → INVALID_MOVE', () => {
    let s = setupBlackHole();
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, isAlive: false } } };
    const r = callMove(s, 'playBlackHoleLevy', [{ p2: 'action_unlock' }], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('技能已使用 1 次 → INVALID_MOVE', () => {
    let s = setupBlackHole();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { [BLACK_HOLE_LEVY_SKILL_ID]: 1 } },
      },
    };
    const r = callMove(s, 'playBlackHoleLevy', [{ p2: 'action_unlock' }], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('同层无其他玩家 → INVALID_MOVE', () => {
    let s = setupBlackHole();
    s = {
      ...s,
      players: {
        ...s.players,
        p2: { ...s.players.p2!, currentLayer: 2 },
        pM: { ...s.players.pM!, currentLayer: 2 },
      },
      layers: {
        ...s.layers,
        1: { ...s.layers[1]!, playersInLayer: ['p1'] },
        2: { ...s.layers[2]!, playersInLayer: ['p2', 'pM'] },
      },
    };
    const r = callMove(s, 'playBlackHoleLevy', [{}], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非抽牌阶段 → INVALID_MOVE', () => {
    let s = setupBlackHole();
    s = { ...s, turnPhase: 'action' };
    const r = callMove(s, 'playBlackHoleLevy', [{ p2: 'action_unlock' }], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });
});

describe('黑洞·吸纳（useBlackHoleAbsorb）', () => {
  it('L2 的 p2+pM 移到 L1（黑洞所在层）', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          characterId: 'thief_black_hole' as CardID,
          currentLayer: 1,
        },
        p2: { ...s.players.p2!, currentLayer: 2 },
        pM: { ...s.players.pM!, currentLayer: 2 },
      },
      layers: {
        ...s.layers,
        1: { ...s.layers[1]!, playersInLayer: ['p1'], heartLockValue: 3 },
        2: { ...s.layers[2]!, playersInLayer: ['p2', 'pM'], heartLockValue: 2 },
      },
    };
    const r = callMove(s, 'useBlackHoleAbsorb', [2], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p2!.currentLayer).toBe(1);
    expect(r.players.pM!.currentLayer).toBe(1);
    expect(r.layers[1]!.playersInLayer).toContain('p2');
    expect(r.layers[1]!.playersInLayer).toContain('pM');
    expect(r.layers[2]!.playersInLayer).not.toContain('p2');
    // 标记已使用
    expect(r.players.p1!.skillUsedThisTurn[BLACK_HOLE_ABSORB_SKILL_ID]).toBe(1);
  });

  it('指定非相邻层 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_black_hole' as CardID, currentLayer: 1 },
      },
    };
    const r = callMove(s, 'useBlackHoleAbsorb', [3], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('指定迷失层(0) → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_black_hole' as CardID, currentLayer: 1 },
      },
    };
    const r = callMove(s, 'useBlackHoleAbsorb', [0], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('目标层无存活玩家 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_black_hole' as CardID, currentLayer: 1 },
        p2: { ...s.players.p2!, currentLayer: 2, isAlive: false },
        pM: { ...s.players.pM!, currentLayer: 2, isAlive: false },
      },
      layers: {
        ...s.layers,
        1: { ...s.layers[1]!, playersInLayer: ['p1'] },
        2: { ...s.layers[2]!, playersInLayer: ['p2', 'pM'] },
      },
    };
    const r = callMove(s, 'useBlackHoleAbsorb', [2], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非黑洞角色 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_architect' as CardID, currentLayer: 1 },
      },
    };
    const r = callMove(s, 'useBlackHoleAbsorb', [2], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('技能已使用 1 次 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'action',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          characterId: 'thief_black_hole' as CardID,
          currentLayer: 1,
          skillUsedThisTurn: { [BLACK_HOLE_ABSORB_SKILL_ID]: 1 },
        },
      },
    };
    const r = callMove(s, 'useBlackHoleAbsorb', [2], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非行动阶段 → INVALID_MOVE', () => {
    let s = scenarioStartOfGame3p();
    s = {
      ...s,
      turnPhase: 'draw',
      currentPlayerID: 'p1',
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_black_hole' as CardID, currentLayer: 1 },
      },
    };
    const r = callMove(s, 'useBlackHoleAbsorb', [2], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });
});
