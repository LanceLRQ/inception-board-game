// 意念判官·定罪两步 move 测试
// 对照：docs/manual/05-dream-thieves.md 意念判官

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { SUDGER_SKILL_ID } from './engine/skills.js';

function setupSudger() {
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
        characterId: 'thief_sudger_of_mind' as CardID,
        currentLayer: 1,
        hand: ['action_shoot' as CardID, 'action_unlock' as CardID],
      },
      p2: {
        ...s.players.p2!,
        currentLayer: 1,
        hand: ['action_unlock' as CardID, 'action_shift' as CardID, 'action_kick' as CardID],
      },
      pM: {
        ...s.players.pM!,
        currentLayer: 1,
      },
    },
    layers: {
      ...s.layers,
      1: { ...s.layers[1]!, playersInLayer: ['p1', 'p2', 'pM'] },
    },
  };
  return s;
}

describe('playShootSudger（第 1 步：掷双骰存 pending）', () => {
  it('意念判官 + action_shoot → 存储 pendingSudgerRolls', () => {
    const s = setupSudger();
    const r = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], {
      currentPlayer: 'p1',
      rolls: [3, 5],
    });
    expectMoveOk(r);
    expect(r.pendingSudgerRolls).not.toBeNull();
    expect(r.pendingSudgerRolls!.rollA).toBe(3);
    expect(r.pendingSudgerRolls!.rollB).toBe(5);
    expect(r.pendingSudgerRolls!.targetPlayerID).toBe('p2');
    expect(r.pendingSudgerRolls!.cardId).toBe('action_shoot');
    // 技能已标记使用
    expect(r.players.p1!.skillUsedThisTurn[SUDGER_SKILL_ID]).toBe(1);
    // 手牌未变（还未弃牌）
    expect(r.players.p1!.hand).toContain('action_shoot');
  });

  it('非意念判官角色 → INVALID_MOVE', () => {
    let s = setupSudger();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_architect' as CardID } },
    };
    const r = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非 action 阶段 → INVALID_MOVE', () => {
    let s = setupSudger();
    s = { ...s, turnPhase: 'draw' };
    const r = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('已有 pendingSudgerRolls → INVALID_MOVE', () => {
    let s = setupSudger();
    s = {
      ...s,
      pendingSudgerRolls: {
        rollA: 1,
        rollB: 2,
        targetPlayerID: 'p2',
        cardId: 'action_shoot' as CardID,
        deathFaces: [1],
        moveFaces: [2, 3, 4, 5],
        extraOnMove: null,
      },
    };
    const r = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('手牌无 SHOOT → INVALID_MOVE', () => {
    let s = setupSudger();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, hand: ['action_unlock' as CardID] } },
    };
    const r = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('使用 shoot_king → 正确存储 deathFaces=[1,2]', () => {
    let s = setupSudger();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, hand: ['action_shoot_king' as CardID] } },
    };
    const r = callMove(s, 'playShootSudger', ['p2', 'action_shoot_king'], {
      currentPlayer: 'p1',
      rolls: [2, 6],
    });
    expectMoveOk(r);
    expect(r.pendingSudgerRolls!.deathFaces).toEqual([1, 2]);
    expect(r.pendingSudgerRolls!.moveFaces).toEqual([3, 4, 5]);
  });
});

describe('resolveSudgerPick（第 2 步：选 A/B + SHOOT 结算）', () => {
  it('选 A（骰值 1）→ kill target', () => {
    let s = setupSudger();
    // 先执行第 1 步
    s = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], {
      currentPlayer: 'p1',
      rolls: [1, 5], // A=1(death), B=5(move)
    }) as typeof s;
    // 第 2 步：选 A
    const r = callMove(s, 'resolveSudgerPick', ['A'], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
    expect(r.pendingSudgerRolls).toBeNull();
    expect(r.playedCardsThisTurn).toContain('action_shoot');
    // 梦主手牌不包含（不是水星）
    expect(r.players.p1!.hand).not.toContain('action_shoot');
  });

  it('选 B（骰值 5）→ move target 到相邻层', () => {
    let s = setupSudger();
    s = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], {
      currentPlayer: 'p1',
      rolls: [1, 5],
    }) as typeof s;
    const r = callMove(s, 'resolveSudgerPick', ['B'], { currentPlayer: 'p1' });
    expectMoveOk(r);
    // p2 应被移到相邻层（L1→L2）
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(2);
    expect(r.pendingSudgerRolls).toBeNull();
  });

  it('选 A（miss 骰值 6）→ 无事发生', () => {
    let s = setupSudger();
    s = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], {
      currentPlayer: 'p1',
      rolls: [6, 6], // 6 = miss
    }) as typeof s;
    const r = callMove(s, 'resolveSudgerPick', ['A'], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(1); // 未移动
    expect(r.pendingSudgerRolls).toBeNull();
  });

  it('无 pending → INVALID_MOVE', () => {
    const s = setupSudger();
    const r = callMove(s, 'resolveSudgerPick', ['A'], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非当前玩家 → INVALID_MOVE', () => {
    let s = setupSudger();
    s = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], {
      currentPlayer: 'p1',
      rolls: [3, 5],
    }) as typeof s;
    const r = callMove(s, 'resolveSudgerPick', ['A'], { currentPlayer: 'p2' });
    expect(r).toBe('INVALID_MOVE');
  });
});

describe('意念判官·定罪 全流程集成', () => {
  it('完整两步流程：playShootSudger → resolveSudgerPick', () => {
    let s = setupSudger();
    // 第 1 步
    s = callMove(s, 'playShootSudger', ['p2', 'action_shoot'], {
      currentPlayer: 'p1',
      rolls: [1, 4],
    }) as typeof s;
    expect(s.pendingSudgerRolls).not.toBeNull();
    expect(s.pendingSudgerRolls!.rollA).toBe(1);
    expect(s.pendingSudgerRolls!.rollB).toBe(4);
    // 第 2 步：选 B（move）更安全
    const r = callMove(s, 'resolveSudgerPick', ['B'], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
    expect(r.players.p2!.currentLayer).toBe(2);
    expect(r.pendingSudgerRolls).toBeNull();
    expect(r.playedCardsThisTurn).toContain('action_shoot');
    expect(r.players.p1!.hand).not.toContain('action_shoot');
  });

  it('使用 shoot_burst → extraOnMove 弃目标 SHOOT 类', () => {
    let s = setupSudger();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, hand: ['action_shoot_burst' as CardID] },
        p2: { ...s.players.p2!, hand: ['action_shoot' as CardID, 'action_unlock' as CardID] },
      },
    };
    s = callMove(s, 'playShootSudger', ['p2', 'action_shoot_burst'], {
      currentPlayer: 'p1',
      rolls: [1, 5], // A=kill, B=move
    }) as typeof s;
    // 选 B（move，会触发 extraOnMove='discard_shoots'）
    const r = callMove(s, 'resolveSudgerPick', ['B'], { currentPlayer: 'p1' });
    expectMoveOk(r);
    // p2 的 SHOOT 类牌应被弃掉
    expect(r.players.p2!.hand).not.toContain('action_shoot');
    expect(r.players.p2!.hand).toContain('action_unlock');
  });
});
