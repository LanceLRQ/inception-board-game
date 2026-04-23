// 处女 · 完美（thief_virgo.skill_0）实装单测
// 对照：docs/manual/05-dream-thieves.md 处女
// 对照：plans/tasks.md W20.5 · Phase 3 遗留 · 响应窗口技能（5 项）
//
// 覆盖范围：
//   A. 三选一 helper 纯函数（applyVirgoResurrect / applyVirgoDrawTwo / applyVirgoTeleport）
//   B. virgoPerfect.apply 挂起 pendingVirgoChoice
//   C. dispatchPassives(onAfterShoot) 集成（lastShootRoll=6 自动挂起）
//   D. respondVirgoPerfect move 三分支 + skip 跳过

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { applyVirgoResurrect, applyVirgoDrawTwo, applyVirgoTeleport } from './engine/skills.js';
import { virgoPerfect } from './engine/abilities/characters/thief/virgo.js';
import { dispatchPassives } from './engine/abilities/dispatch-helpers.js';
import { scenarioActionPhase } from './testing/scenarios.js';
import { callMove } from './testing/fixtures.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function killPlayer(state: SetupState, playerID: string): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: { ...p, isAlive: false, deathTurn: state.turnNumber, currentLayer: 0 as Layer },
    },
  };
}

function virgoCtx(state: SetupState, virgoID: string) {
  return {
    invokerID: virgoID,
    turnNumber: state.turnNumber,
    turnPhase: state.turnPhase,
    dreamMasterID: state.dreamMasterID,
    invokerFaction: state.players[virgoID]!.faction,
    d6: () => 4,
  };
}

// ============================================================================
// A. 三选一 helper 纯函数
// ============================================================================

describe('处女 · 完美 · applyVirgoResurrect', () => {
  it('正确路径：复活己方阵营死者到 L1', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = killPlayer(s, 'p2');
    expect(s.players.p2!.isAlive).toBe(false);

    const next = applyVirgoResurrect(s, 'p1', 'p2');
    expect(next).not.toBeNull();
    expect(next!.players.p2!.isAlive).toBe(true);
    expect(next!.players.p2!.deathTurn).toBeNull();
    expect(next!.players.p2!.currentLayer).toBe(1);
    expect(next!.players.p2!.hand).toEqual([]);
  });

  it('拒绝：处女自己不在场 / 角色不匹配', () => {
    const s = scenarioActionPhase();
    expect(applyVirgoResurrect(s, 'pM', 'p2')).toBeNull(); // pM 是梦主非处女
  });

  it('拒绝：target 仍存活', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    expect(applyVirgoResurrect(s, 'p1', 'p2')).toBeNull();
  });

  it('拒绝：target 是梦主阵营', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = killPlayer(s, 'pM');
    expect(applyVirgoResurrect(s, 'p1', 'pM')).toBeNull();
  });

  it('拒绝：target=virgo 自己', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    expect(applyVirgoResurrect(s, 'p1', 'p1')).toBeNull();
  });
});

describe('处女 · 完美 · applyVirgoDrawTwo', () => {
  it('正确路径：从牌库顶抽 2 张到 virgo 手牌', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    const handBefore = s.players.p1!.hand.length;
    const deckBefore = s.deck.cards.length;

    const next = applyVirgoDrawTwo(s, 'p1');
    expect(next).not.toBeNull();
    expect(next!.players.p1!.hand.length).toBe(handBefore + 2);
    expect(next!.deck.cards.length).toBe(deckBefore - 2);
  });

  it('拒绝：virgo 死亡', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = killPlayer(s, 'p1');
    expect(applyVirgoDrawTwo(s, 'p1')).toBeNull();
  });

  it('牌库为空时抽 0 张（drawCards 容错）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = { ...s, deck: { cards: [], discardPile: [] } };
    const next = applyVirgoDrawTwo(s, 'p1');
    // drawCards 在 deck 为空时直接返回原 state（不会变 null）
    expect(next).not.toBeNull();
    expect(next!.players.p1!.hand.length).toBe(s.players.p1!.hand.length);
  });
});

describe('处女 · 完美 · applyVirgoTeleport', () => {
  it('正确路径：跨层传送到 L4（无视相邻规则）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    expect(s.players.p1!.currentLayer).toBe(1);

    const next = applyVirgoTeleport(s, 'p1', 4);
    expect(next).not.toBeNull();
    expect(next!.players.p1!.currentLayer).toBe(4);
  });

  it('拒绝：layer=0（迷失层）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    expect(applyVirgoTeleport(s, 'p1', 0)).toBeNull();
  });

  it('拒绝：layer=5 越界', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    expect(applyVirgoTeleport(s, 'p1', 5)).toBeNull();
  });

  it('拒绝：非整数 layer', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    expect(applyVirgoTeleport(s, 'p1', 2.5)).toBeNull();
  });
});

// ============================================================================
// B. virgoPerfect.apply 挂起 pendingVirgoChoice
// ============================================================================

describe('处女 · 完美 · ability.apply', () => {
  it('lastShootRoll=6 + 角色匹配 → 挂起 pendingVirgoChoice', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = { ...s, lastShootRoll: 6, currentPlayerID: 'p2' };
    const r = virgoPerfect.apply(s, virgoCtx(s, 'p1'), {});
    expect(r.state).not.toBeNull();
    expect(r.state!.pendingVirgoChoice).toEqual({
      virgoID: 'p1',
      triggerRoll: 6,
      shooterID: 'p2',
    });
  });

  it('lastShootRoll≠6 → no-op', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = { ...s, lastShootRoll: 5 };
    const r = virgoPerfect.apply(s, virgoCtx(s, 'p1'), {});
    expect(r.state).not.toBeNull();
    expect(r.state!.pendingVirgoChoice).toBeNull();
  });

  it('已挂起 pendingVirgoChoice → 不重入', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = {
      ...s,
      lastShootRoll: 6,
      pendingVirgoChoice: { virgoID: 'p1', triggerRoll: 6, shooterID: 'p2' },
    };
    const r = virgoPerfect.apply(s, virgoCtx(s, 'p1'), {});
    expect(r.state).toBe(s); // 引用相等：未生成新状态
  });
});

// ============================================================================
// C. dispatchPassives(onAfterShoot) 集成
// ============================================================================

describe('处女 · 完美 · dispatchPassives 集成', () => {
  it('lastShootRoll=6 + 处女在场 → dispatchPassives 自动挂起', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = { ...s, lastShootRoll: 6 };
    const r = dispatchPassives(s, 'onAfterShoot');
    expect(r.state.pendingVirgoChoice).not.toBeNull();
    expect(r.state.pendingVirgoChoice!.virgoID).toBe('p1');
  });

  it('lastShootRoll=5 + 处女在场 → 不触发', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_virgo');
    s = { ...s, lastShootRoll: 5 };
    const r = dispatchPassives(s, 'onAfterShoot');
    expect(r.state.pendingVirgoChoice).toBeNull();
  });

  it('无处女角色 + lastShootRoll=6 → 不触发', () => {
    const s = { ...scenarioActionPhase(), lastShootRoll: 6 };
    const r = dispatchPassives(s, 'onAfterShoot');
    expect(r.state.pendingVirgoChoice).toBeNull();
  });
});

// ============================================================================
// D. respondVirgoPerfect move 三分支 + skip
// ============================================================================

function sceneWithPending(virgoIsP1 = true): SetupState {
  let s = scenarioActionPhase();
  if (virgoIsP1) s = setCharacter(s, 'p1', 'thief_virgo');
  return {
    ...s,
    pendingVirgoChoice: { virgoID: 'p1', triggerRoll: 6, shooterID: 'p2' },
  };
}

describe('处女 · 完美 · respondVirgoPerfect move', () => {
  it('skip 分支：清空 pending 不施加副作用', () => {
    const s = sceneWithPending();
    const handBefore = s.players.p1!.hand.length;
    const result = callMove(s, 'respondVirgoPerfect', ['skip'], { currentPlayer: 'p1' });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.pendingVirgoChoice).toBeNull();
    expect(next.players.p1!.hand.length).toBe(handBefore);
  });

  it('draw_two 分支：抽 2 张 + 清空 pending', () => {
    const s = sceneWithPending();
    const handBefore = s.players.p1!.hand.length;
    const result = callMove(s, 'respondVirgoPerfect', ['draw_two'], { currentPlayer: 'p1' });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.players.p1!.hand.length).toBe(handBefore + 2);
    expect(next.pendingVirgoChoice).toBeNull();
  });

  it('teleport 分支：传送到指定层 + 清空 pending', () => {
    const s = sceneWithPending();
    const result = callMove(s, 'respondVirgoPerfect', ['teleport', { layer: 3 }], {
      currentPlayer: 'p1',
    });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.players.p1!.currentLayer).toBe(3);
    expect(next.pendingVirgoChoice).toBeNull();
  });

  it('teleport 拒绝：layer 参数缺失', () => {
    const s = sceneWithPending();
    const result = callMove(s, 'respondVirgoPerfect', ['teleport', {}], { currentPlayer: 'p1' });
    expect(result).toBe('INVALID_MOVE');
    // pending 不应被清空
  });

  it('revive 分支：复活己方死者 + 清空 pending', () => {
    let s = sceneWithPending();
    s = killPlayer(s, 'p2');
    const result = callMove(s, 'respondVirgoPerfect', ['revive', { targetID: 'p2' }], {
      currentPlayer: 'p1',
    });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.players.p2!.isAlive).toBe(true);
    expect(next.players.p2!.currentLayer).toBe(1);
    expect(next.pendingVirgoChoice).toBeNull();
  });

  it('revive 拒绝：targetID 缺失', () => {
    const s = sceneWithPending();
    const result = callMove(s, 'respondVirgoPerfect', ['revive', {}], { currentPlayer: 'p1' });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：非 virgoID 本人发起', () => {
    const s = sceneWithPending();
    const result = callMove(s, 'respondVirgoPerfect', ['skip'], { currentPlayer: 'p2' });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：无 pendingVirgoChoice', () => {
    const s = scenarioActionPhase();
    const result = callMove(s, 'respondVirgoPerfect', ['skip'], { currentPlayer: 'p1' });
    expect(result).toBe('INVALID_MOVE');
  });

  it('拒绝：未知 choice', () => {
    const s = sceneWithPending();
    const result = callMove(s, 'respondVirgoPerfect', ['unknown' as never], {
      currentPlayer: 'p1',
    });
    expect(result).toBe('INVALID_MOVE');
  });
});

// ============================================================================
// E. endActionPhase 阻断（pendingVirgoChoice 未消费）
// ============================================================================

describe('处女 · 完美 · endActionPhase 阻断', () => {
  it('pendingVirgoChoice 未消费时 endActionPhase → INVALID_MOVE', () => {
    const s = sceneWithPending();
    const result = callMove(s, 'endActionPhase', [], { currentPlayer: 'p1' });
    expect(result).toBe('INVALID_MOVE');
  });

  it('pendingVirgoChoice 清空后 endActionPhase 正常', () => {
    let s = sceneWithPending();
    s = { ...s, pendingVirgoChoice: null };
    const result = callMove(s, 'endActionPhase', [], { currentPlayer: 'p1' });
    expect(result).not.toBe('INVALID_MOVE');
  });
});
