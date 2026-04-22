// 批次 D · M4 卡宾枪全局化 · 集成测试
// 对照：docs/manual/03-game-flow.md §80-81 M4 卡宾枪；§111 印证 M4 先于处女·完美处理
// 对照：plans/report/skill-development-status.md 批次 D
//
// 目标：验证梦主使用普通 SHOOT 时，目标骰值经 M4 修饰后（-1）决定结果
//       盗梦者 SHOOT 保持原骰值（M4 不触发）

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { callMove } from './testing/fixtures.js';
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

describe('M4 卡宾枪全局化（批次 D）', () => {
  it('梦主 SHOOT + 掷 2 → M4 后为 1 → 击杀（普通 SHOOT deathFaces=[1]）', () => {
    // 普通 SHOOT: roll=1 杀, 2-5 移, 6 miss
    let s = scenarioActionPhase();
    s = setCharacter(s, 'pM', 'dm_fortress'); // 任意梦主
    s = setHand(s, 'pM', ['action_shoot'] as CardID[]);
    s = { ...s, currentPlayerID: 'pM' };
    const res = callMove(s, 'playShoot', ['p1', 'action_shoot'], {
      currentPlayer: 'pM',
      rolls: [2], // baseRoll=2, M4后=1 → 击杀
    });
    expect(res).not.toBe('INVALID_MOVE');
    const next = res as SetupState;
    expect(next.players.p1!.isAlive).toBe(false);
  });

  it('盗梦者 SHOOT + 掷 2 → M4 不触发 → 移动（非击杀）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_pointman'); // 非特殊修饰角色
    s = setHand(s, 'p1', ['action_shoot'] as CardID[]);
    s = { ...s, currentPlayerID: 'p1' };
    const res = callMove(s, 'playShoot', ['p2', 'action_shoot'], {
      currentPlayer: 'p1',
      rolls: [2], // baseRoll=2, 盗梦者 M4 不触发 → 移动
    });
    expect(res).not.toBe('INVALID_MOVE');
    const next = res as SetupState;
    // p2 存活（未击杀）
    expect(next.players.p2!.isAlive).toBe(true);
  });

  it('梦主 SHOOT + 掷 1 → M4 后仍为 1（clamp）→ 击杀', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'pM', 'dm_fortress');
    s = setHand(s, 'pM', ['action_shoot'] as CardID[]);
    s = { ...s, currentPlayerID: 'pM' };
    const res = callMove(s, 'playShoot', ['p1', 'action_shoot'], {
      currentPlayer: 'pM',
      rolls: [1],
    });
    expect(res).not.toBe('INVALID_MOVE');
    const next = res as SetupState;
    expect(next.players.p1!.isAlive).toBe(false);
  });

  it('梦主 SHOOT + 掷 6 → M4 后为 5 → 移动（不 miss）', () => {
    // 普通 SHOOT: 5 属于 move 面
    let s = scenarioActionPhase();
    s = setCharacter(s, 'pM', 'dm_fortress');
    s = setHand(s, 'pM', ['action_shoot'] as CardID[]);
    s = { ...s, currentPlayerID: 'pM' };
    const res = callMove(s, 'playShoot', ['p1', 'action_shoot'], {
      currentPlayer: 'pM',
      rolls: [6],
    });
    expect(res).not.toBe('INVALID_MOVE');
    const next = res as SetupState;
    // 未 miss（miss 是骰 6；M4 后 5 属于 move face）→ p1 仍存活（移动或挂起 pendingShootMove）
    expect(next.players.p1!.isAlive).toBe(true);
  });

  it('lastShootRoll 记录的是 M4 前的原始骰值（动画展示）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'pM', 'dm_fortress');
    s = setHand(s, 'pM', ['action_shoot'] as CardID[]);
    s = { ...s, currentPlayerID: 'pM' };
    const res = callMove(s, 'playShoot', ['p1', 'action_shoot'], {
      currentPlayer: 'pM',
      rolls: [3],
    });
    expect(res).not.toBe('INVALID_MOVE');
    const next = res as SetupState;
    expect(next.lastShootRoll).toBe(3);
  });
});
