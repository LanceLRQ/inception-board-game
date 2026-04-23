// 双鱼 · 闪避（thief_pisces.skill_0）SHOOT 响应窗口集成单测
// 对照：docs/manual/05-dream-thieves.md 双鱼
// 对照：plans/tasks.md W20.5 · Phase 3 遗留 · 响应窗口技能（5 项）批次 C
//
// 覆盖范围：
//   A. applyShootVariant 触发 pendingShootResponse 挂起
//   B. respondShootEvade move（双鱼移层 + 翻面 + 弃 SHOOT 卡）
//   C. respondShootPass move（重入 SHOOT 核心继续骰）
//   D. endActionPhase 阻断 + 拒绝路径

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { callMove, createTestState, makePlayer } from './testing/fixtures.js';

const SHOOT: CardID = 'action_shoot' as CardID;

/**
 * 标准场景：
 *   - p1 盗梦者梦主（faction=master）位于 L2，手牌 [SHOOT]，作为 shooter
 *   - p2 双鱼（thief_pisces）位于 L2，未翻面，可闪避
 *   - p3 普通盗梦者位于 L1
 */
function sceneShooterVsPisces(): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: 'p1',
  });
  return {
    ...base,
    players: {
      ...base.players,
      p1: makePlayer({
        id: 'p1',
        nickname: 'P1',
        faction: 'master',
        characterId: 'dm_fortress' as CardID,
        currentLayer: 2 as Layer,
        hand: [SHOOT, 'action_unlock' as CardID],
      }),
      p2: makePlayer({
        id: 'p2',
        nickname: 'P2',
        faction: 'thief',
        characterId: 'thief_pisces' as CardID,
        currentLayer: 2 as Layer,
        isRevealed: false,
        hand: [],
      }),
      p3: makePlayer({
        id: 'p3',
        nickname: 'P3',
        faction: 'thief',
        currentLayer: 1 as Layer,
      }),
    },
    layers: {
      ...base.layers,
      1: { ...base.layers[1]!, playersInLayer: ['p3'] },
      2: { ...base.layers[2]!, playersInLayer: ['p1', 'p2'] },
    },
  };
}

// ============================================================================
// A. applyShootVariant 触发 pendingShootResponse 挂起
// ============================================================================

describe('双鱼 · 闪避 · pendingShootResponse 挂起', () => {
  it('梦主 SHOOT 双鱼 → 挂起 pendingShootResponse + 未弃 SHOOT 卡', () => {
    const s = sceneShooterVsPisces();
    const handBefore = s.players.p1!.hand.length;
    const result = callMove(s, 'playShoot', ['p2', SHOOT], {
      currentPlayer: 'p1',
      rolls: [3], // 不会被消费（pre-roll 拦截）
    });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.pendingShootResponse).not.toBeNull();
    expect(next.pendingShootResponse!.shooterID).toBe('p1');
    expect(next.pendingShootResponse!.targetPlayerID).toBe('p2');
    expect(next.pendingShootResponse!.cardId).toBe(SHOOT);
    // SHOOT 卡尚未被弃（等响应消费）
    expect(next.players.p1!.hand.length).toBe(handBefore);
  });

  it('双鱼在 L1（无更小相邻层）→ 不挂起，正常 SHOOT', () => {
    let s = sceneShooterVsPisces();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, currentLayer: 1 as Layer },
        p2: { ...s.players.p2!, currentLayer: 1 as Layer },
      },
      layers: {
        ...s.layers,
        1: { ...s.layers[1]!, playersInLayer: ['p1', 'p2', 'p3'] },
        2: { ...s.layers[2]!, playersInLayer: [] },
      },
    };
    const result = callMove(s, 'playShoot', ['p2', SHOOT], {
      currentPlayer: 'p1',
      rolls: [4], // miss
    });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.pendingShootResponse).toBeNull();
  });

  it('双鱼本回合已用闪避 → 不挂起', () => {
    let s = sceneShooterVsPisces();
    s = {
      ...s,
      players: {
        ...s.players,
        p2: {
          ...s.players.p2!,
          skillUsedThisTurn: { 'thief_pisces.skill_0': 1 },
        },
      },
    };
    const result = callMove(s, 'playShoot', ['p2', SHOOT], {
      currentPlayer: 'p1',
      rolls: [4],
    });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.pendingShootResponse).toBeNull();
  });

  it('target 不是双鱼角色 → 不挂起', () => {
    let s = sceneShooterVsPisces();
    s = {
      ...s,
      players: {
        ...s.players,
        p2: { ...s.players.p2!, characterId: 'thief_aquarius' as CardID },
      },
    };
    const result = callMove(s, 'playShoot', ['p2', SHOOT], {
      currentPlayer: 'p1',
      rolls: [4],
    });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.pendingShootResponse).toBeNull();
  });
});

// ============================================================================
// B. respondShootEvade move
// ============================================================================

describe('双鱼 · 闪避 · respondShootEvade', () => {
  it('正确路径：移到 L1 + 翻面 + shooter 弃 SHOOT 卡 + 清空 pending', () => {
    const initial = sceneShooterVsPisces();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;
    expect(after1.pendingShootResponse).not.toBeNull();

    const r2 = callMove(after1, 'respondShootEvade', [], { currentPlayer: 'p2' });
    expect(r2).not.toBe('INVALID_MOVE');
    const next = r2 as SetupState;
    expect(next.pendingShootResponse).toBeNull();
    expect(next.players.p2!.currentLayer).toBe(1);
    // 翻面：characterId 从 thief_pisces 切到 thief_pisces_back
    expect(next.players.p2!.characterId).toBe('thief_pisces_back');
    // SHOOT 卡已弃
    expect(next.players.p1!.hand).not.toContain(SHOOT);
    // skill 已记录使用
    expect(next.players.p2!.skillUsedThisTurn['thief_pisces.skill_0']).toBe(1);
  });

  it('拒绝：非 target 本人发起', () => {
    const initial = sceneShooterVsPisces();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    const r2 = callMove(after1, 'respondShootEvade', [], { currentPlayer: 'p3' });
    expect(r2).toBe('INVALID_MOVE');
  });

  it('拒绝：无 pendingShootResponse', () => {
    const s = sceneShooterVsPisces();
    const r = callMove(s, 'respondShootEvade', [], { currentPlayer: 'p2' });
    expect(r).toBe('INVALID_MOVE');
  });
});

// ============================================================================
// C. respondShootPass move
// ============================================================================

describe('双鱼 · 闪避 · respondShootPass', () => {
  it('正确路径：放弃响应 → 重入 SHOOT 核心继续骰（kill 路径）', () => {
    const initial = sceneShooterVsPisces();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;
    expect(after1.pendingShootResponse).not.toBeNull();

    // 放弃响应；rolls=[1] → kill（M4 修饰梦主 SHOOT，1-1=0，仍 kill）
    const r2 = callMove(after1, 'respondShootPass', [], {
      currentPlayer: 'p2',
      rolls: [1],
    });
    expect(r2).not.toBe('INVALID_MOVE');
    const next = r2 as SetupState;
    expect(next.pendingShootResponse).toBeNull();
    // SHOOT 卡已弃
    expect(next.players.p1!.hand).not.toContain(SHOOT);
    // p2 死亡
    expect(next.players.p2!.isAlive).toBe(false);
    expect(next.players.p2!.currentLayer).toBe(0);
  });

  it('正确路径：放弃响应 → miss（rolls=[5,5,5,5,5]，骰值高于 deathFaces+moveFaces）', () => {
    const initial = sceneShooterVsPisces();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    // 通用 SHOOT deathFaces=[1] / moveFaces=[2,3,4]；M4 后 5-1=4 → move
    // 双鱼在 L2 → choices=[1,3]，挂起 pendingShootMove
    const r2 = callMove(after1, 'respondShootPass', [], {
      currentPlayer: 'p2',
      rolls: [5],
    });
    expect(r2).not.toBe('INVALID_MOVE');
    const next = r2 as SetupState;
    expect(next.pendingShootResponse).toBeNull();
    // SHOOT 卡已弃
    expect(next.players.p1!.hand).not.toContain(SHOOT);
  });

  it('拒绝：非 target 本人发起', () => {
    const initial = sceneShooterVsPisces();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    const r2 = callMove(after1, 'respondShootPass', [], { currentPlayer: 'p3' });
    expect(r2).toBe('INVALID_MOVE');
  });

  it('拒绝：无 pendingShootResponse', () => {
    const s = sceneShooterVsPisces();
    const r = callMove(s, 'respondShootPass', [], { currentPlayer: 'p2' });
    expect(r).toBe('INVALID_MOVE');
  });
});

// ============================================================================
// D. endActionPhase 阻断
// ============================================================================

describe('双鱼 · 闪避 · endActionPhase 阻断', () => {
  it('pendingShootResponse 未消费时 endActionPhase → INVALID_MOVE', () => {
    const initial = sceneShooterVsPisces();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    const r2 = callMove(after1, 'endActionPhase', [], { currentPlayer: 'p1' });
    expect(r2).toBe('INVALID_MOVE');
  });
});
