// W12 天秤 + W13 筑梦师 pending state 接入集成测试
// 对照：plans/tasks.md Phase 3 W12 Tier C / W13 筑梦师·迷宫
// schema v2: pendingLibra + mazeState

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { LIBRA_SKILL_ID, ARCHITECT_SKILL_ID } from './engine/skills.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { scenarioActionPhase } from './testing/scenarios.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return { ...state, players: { ...state.players, [playerID]: { ...p, hand } } };
}

// ============================================================================
// 天秤 · 平衡 三步交互（playLibraBalance → resolveLibraSplit → resolveLibraPick）
// ============================================================================
describe('天秤 · 平衡（三阶段 pendingLibra）', () => {
  function setupLibraScenario(): SetupState {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_libra' as CardID);
    s = setHand(s, 'p1', ['action_kick', 'action_unlock', 'action_creation'] as CardID[]);
    s = setHand(s, 'p2', []);
    return s;
  }

  it('step 1：playLibraBalance 把全部手牌转给 target，进入 pendingLibra', () => {
    const s = setupLibraScenario();
    const r = callMove(s, 'playLibraBalance', ['p2']);
    expectMoveOk(r);
    expect(r.players.p1!.hand).toEqual([]);
    expect(r.players.p2!.hand).toEqual(['action_kick', 'action_unlock', 'action_creation']);
    expect(r.pendingLibra).toEqual({
      bonderPlayerID: 'p1',
      targetPlayerID: 'p2',
      split: null,
    });
    expect(r.players.p1!.skillUsedThisTurn[LIBRA_SKILL_ID]).toBe(1);
  });

  it('step 2：resolveLibraSplit 由 target 提交分组', () => {
    const s = setupLibraScenario();
    const r1 = callMove(s, 'playLibraBalance', ['p2']);
    expectMoveOk(r1);
    const r2 = callMove(
      r1,
      'resolveLibraSplit',
      [['action_kick'] as CardID[], ['action_unlock', 'action_creation'] as CardID[]],
      { currentPlayer: 'p2' },
    );
    expectMoveOk(r2);
    expect(r2.pendingLibra!.split).toEqual({
      pile1: ['action_kick'],
      pile2: ['action_unlock', 'action_creation'],
    });
  });

  it('step 2 拒绝：分组内容不匹配 target 手牌', () => {
    const s = setupLibraScenario();
    const r1 = callMove(s, 'playLibraBalance', ['p2']);
    expectMoveOk(r1);
    const bad = callMove(
      r1,
      'resolveLibraSplit',
      [['action_kick'] as CardID[], ['action_shoot' as CardID]],
      { currentPlayer: 'p2' },
    );
    expect(bad).toBe('INVALID_MOVE');
  });

  // R23：engine 放宽 ctx.currentPlayer guard（单机模式 worker 代发）；
  // split 合法性仍由 libraValidateSplit 守护，参与方由 pendingLibra 身份守护。
  it('step 2 放宽：任一参与方可代发合法 split（R23 单机简化）', () => {
    const s = setupLibraScenario();
    const r1 = callMove(s, 'playLibraBalance', ['p2']);
    expectMoveOk(r1);
    // bonder (p1) 代发合法 split：现在接受
    const r2 = callMove(
      r1,
      'resolveLibraSplit',
      [['action_kick'] as CardID[], ['action_unlock', 'action_creation'] as CardID[]],
      { currentPlayer: 'p1' },
    );
    expectMoveOk(r2);
  });

  it('step 3：resolveLibraPick bonder 选 pile1 → 拿 pile1，target 留 pile2', () => {
    const s = setupLibraScenario();
    const r1 = callMove(s, 'playLibraBalance', ['p2']);
    expectMoveOk(r1);
    const r2 = callMove(
      r1,
      'resolveLibraSplit',
      [['action_kick'] as CardID[], ['action_unlock', 'action_creation'] as CardID[]],
      { currentPlayer: 'p2' },
    );
    expectMoveOk(r2);
    const r3 = callMove(r2, 'resolveLibraPick', ['pile1']);
    expectMoveOk(r3);
    expect(r3.players.p1!.hand).toEqual(['action_kick']);
    expect(r3.players.p2!.hand).toEqual(['action_unlock', 'action_creation']);
    expect(r3.pendingLibra).toBeNull();
  });

  it('step 3：选 pile2 → 拿 pile2，target 留 pile1', () => {
    const s = setupLibraScenario();
    const r1 = callMove(s, 'playLibraBalance', ['p2']);
    expectMoveOk(r1);
    const r2 = callMove(
      r1,
      'resolveLibraSplit',
      [['action_kick'] as CardID[], ['action_unlock', 'action_creation'] as CardID[]],
      { currentPlayer: 'p2' },
    );
    expectMoveOk(r2);
    const r3 = callMove(r2, 'resolveLibraPick', ['pile2']);
    expectMoveOk(r3);
    expect(r3.players.p1!.hand).toEqual(['action_unlock', 'action_creation']);
    expect(r3.players.p2!.hand).toEqual(['action_kick']);
  });

  it('step 3 拒绝：split 未提交', () => {
    const s = setupLibraScenario();
    const r1 = callMove(s, 'playLibraBalance', ['p2']);
    expectMoveOk(r1);
    expect(callMove(r1, 'resolveLibraPick', ['pile1'])).toBe('INVALID_MOVE');
  });

  it('step 1 拒绝：非天秤角色', () => {
    const s = setHand(scenarioActionPhase(), 'p1', ['action_kick'] as CardID[]);
    expect(callMove(s, 'playLibraBalance', ['p2'])).toBe('INVALID_MOVE');
  });

  it('step 1 拒绝：手牌为空', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_libra' as CardID);
    expect(callMove(s, 'playLibraBalance', ['p2'])).toBe('INVALID_MOVE');
  });

  it('回合限 1 次：第二次 playLibraBalance 拒绝', () => {
    const s = setupLibraScenario();
    const r1 = callMove(s, 'playLibraBalance', ['p2']);
    expectMoveOk(r1);
    const r2 = callMove(
      r1,
      'resolveLibraSplit',
      [['action_kick'] as CardID[], ['action_unlock', 'action_creation'] as CardID[]],
      { currentPlayer: 'p2' },
    );
    expectMoveOk(r2);
    const r3 = callMove(r2, 'resolveLibraPick', ['pile1']);
    expectMoveOk(r3);
    // 给 p1 重新发手牌后再尝试
    const reHand = setHand(r3, 'p1', ['action_peek'] as CardID[]);
    expect(callMove(reHand, 'playLibraBalance', ['p2'])).toBe('INVALID_MOVE');
  });
});

// ============================================================================
// 筑梦师 · 迷宫（mazeState 设置 + 回合末过期清除）
// ============================================================================
describe('筑梦师 · 迷宫（mazeState）', () => {
  function setupMazeScenario(): SetupState {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_architect' as CardID);
    s = setHand(s, 'p1', ['action_shoot', 'action_unlock'] as CardID[]);
    return s;
  }

  it('成功：弃 SHOOT 类牌 → mazeState 设置 + 弃牌堆增加', () => {
    const s = setupMazeScenario();
    const r = callMove(s, 'playArchitectMaze', ['action_shoot' as CardID, 'p2']);
    expectMoveOk(r);
    expect(r.mazeState).toEqual({
      mazedPlayerID: 'p2',
      untilTurnNumber: s.turnNumber + s.playerOrder.length,
    });
    expect(r.deck.discardPile).toContain('action_shoot');
    expect(r.players.p1!.hand).toEqual(['action_unlock']);
    expect(r.players.p1!.skillUsedThisTurn[ARCHITECT_SKILL_ID]).toBe(1);
  });

  it('拒绝：非筑梦师', () => {
    const s = setHand(scenarioActionPhase(), 'p1', ['action_shoot'] as CardID[]);
    expect(callMove(s, 'playArchitectMaze', ['action_shoot' as CardID, 'p2'])).toBe('INVALID_MOVE');
  });

  it('拒绝：弃牌不是 SHOOT 类', () => {
    const s = setupMazeScenario();
    expect(callMove(s, 'playArchitectMaze', ['action_unlock' as CardID, 'p2'])).toBe(
      'INVALID_MOVE',
    );
  });

  it('拒绝：跨层目标', () => {
    let s = setupMazeScenario();
    // 把 p2 移到 layer 3
    s = {
      ...s,
      players: {
        ...s.players,
        p2: { ...s.players.p2!, currentLayer: 3 },
      },
      layers: {
        ...s.layers,
        1: {
          ...s.layers[1]!,
          playersInLayer: s.layers[1]!.playersInLayer.filter((id) => id !== 'p2'),
        },
        3: { ...s.layers[3]!, playersInLayer: [...s.layers[3]!.playersInLayer, 'p2'] },
      },
    };
    expect(callMove(s, 'playArchitectMaze', ['action_shoot' as CardID, 'p2'])).toBe('INVALID_MOVE');
  });

  it('拒绝：自指', () => {
    const s = setupMazeScenario();
    expect(callMove(s, 'playArchitectMaze', ['action_shoot' as CardID, 'p1'])).toBe('INVALID_MOVE');
  });

  it('限制：本回合 1 次', () => {
    let s = setupMazeScenario();
    s = setHand(s, 'p1', ['action_shoot', 'action_shoot'] as CardID[]);
    const r1 = callMove(s, 'playArchitectMaze', ['action_shoot' as CardID, 'p2']);
    expectMoveOk(r1);
    expect(callMove(r1, 'playArchitectMaze', ['action_shoot' as CardID, 'p2'])).toBe(
      'INVALID_MOVE',
    );
  });
});
