// 恐怖分子 · 狂热（thief_terrorist.skill_1）SHOOT 响应窗口集成单测
// 对照：docs/manual/05-dream-thieves.md 恐怖分子 247 行
// 对照：plans/tasks.md W20.5 · Phase 3 遗留 · 响应窗口技能（5 项）批次 D
//
// 规则："当你使用 SHOOT 类牌时，除非目标玩家在掷骰前弃掉 1 张手牌，否则掷骰结果 -1"
//
// 覆盖范围：
//   A. 恐怖分子 SHOOT → 挂起 pendingShootResponse(responseType='terrorist')
//   B. respondTerroristDiscard：target 弃 1 张 → 重入 SHOOT 无 -1 惩罚
//   C. respondTerroristAccept：target 拒弃 → 重入 SHOOT 应用 -1 惩罚
//   D. 拒绝路径 + 与 Pisces 共存（恐怖分子 SHOOT 双鱼 → Pisces 优先）

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import { callMove, createTestState, makePlayer } from './testing/fixtures.js';

const SHOOT: CardID = 'action_shoot' as CardID;
const KICK: CardID = 'action_kick' as CardID;

/**
 * 恐怖分子 SHOOT 普通盗梦者场景：
 *   - p1 恐怖分子（thief_terrorist）位于 L2，手牌 [SHOOT]，作为 shooter
 *   - p2 普通盗梦者位于 L2，手牌 [KICK]
 *   - p3 普通盗梦者位于 L1
 */
function sceneTerroristVsThief(): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
  });
  return {
    ...base,
    players: {
      ...base.players,
      p1: makePlayer({
        id: 'p1',
        nickname: 'P1',
        faction: 'thief',
        characterId: 'thief_terrorist' as CardID,
        currentLayer: 2 as Layer,
        hand: [SHOOT],
      }),
      p2: makePlayer({
        id: 'p2',
        nickname: 'P2',
        faction: 'thief',
        characterId: 'thief_aquarius' as CardID,
        currentLayer: 2 as Layer,
        hand: [KICK],
      }),
      p3: makePlayer({
        id: 'p3',
        nickname: 'P3',
        faction: 'thief',
        currentLayer: 1 as Layer,
      }),
      pM: makePlayer({
        id: 'pM',
        nickname: 'PM',
        faction: 'master',
        characterId: 'dm_fortress' as CardID,
        currentLayer: 1 as Layer,
      }),
    },
    layers: {
      ...base.layers,
      1: { ...base.layers[1]!, playersInLayer: ['p3', 'pM'] },
      2: { ...base.layers[2]!, playersInLayer: ['p1', 'p2'] },
    },
  };
}

// ============================================================================
// A. 挂起 pendingShootResponse
// ============================================================================

describe('恐怖分子 · 狂热 · pendingShootResponse 挂起', () => {
  it('恐怖分子 SHOOT 普通盗梦者 → 挂起 responseType=terrorist + 未弃 SHOOT 卡', () => {
    const s = sceneTerroristVsThief();
    const handBefore = s.players.p1!.hand.length;
    const result = callMove(s, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    expect(result).not.toBe('INVALID_MOVE');
    const next = result as SetupState;
    expect(next.pendingShootResponse).not.toBeNull();
    expect(next.pendingShootResponse!.responseType).toBe('terrorist');
    expect(next.pendingShootResponse!.shooterID).toBe('p1');
    expect(next.pendingShootResponse!.targetPlayerID).toBe('p2');
    // SHOOT 卡尚未被弃（pre-roll 挂起）
    expect(next.players.p1!.hand.length).toBe(handBefore);
  });

  it('普通盗梦者 SHOOT（非恐怖分子）→ 不挂 Terrorist 窗口', () => {
    let s = sceneTerroristVsThief();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, characterId: 'thief_aquarius' as CardID },
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
});

// ============================================================================
// B. respondTerroristDiscard
// ============================================================================

describe('恐怖分子 · 狂热 · respondTerroristDiscard', () => {
  it('正确路径：target 弃 1 张 → 重入 SHOOT 无 -1 惩罚 + kill', () => {
    const initial = sceneTerroristVsThief();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    // p2 弃 KICK + 重入 SHOOT，rolls=[1] → kill（无 -1）
    const r2 = callMove(after1, 'respondTerroristDiscard', [KICK], {
      currentPlayer: 'p2',
      rolls: [1],
    });
    expect(r2).not.toBe('INVALID_MOVE');
    const next = r2 as SetupState;
    expect(next.pendingShootResponse).toBeNull();
    // p2 死亡（rolls=1 命中 deathFaces=[1]）
    expect(next.players.p2!.isAlive).toBe(false);
    // p2 KICK 已弃
    expect(next.players.p2!.hand).not.toContain(KICK);
    // SHOOT 卡也已弃
    expect(next.players.p1!.hand).not.toContain(SHOOT);
  });

  it('拒绝：target 手中无该 cardId', () => {
    const initial = sceneTerroristVsThief();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    const r2 = callMove(after1, 'respondTerroristDiscard', [SHOOT], { currentPlayer: 'p2' });
    expect(r2).toBe('INVALID_MOVE');
  });

  it('拒绝：非 target 本人发起', () => {
    const initial = sceneTerroristVsThief();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    const r2 = callMove(after1, 'respondTerroristDiscard', [KICK], { currentPlayer: 'p3' });
    expect(r2).toBe('INVALID_MOVE');
  });

  it('拒绝：响应类型 mismatch（pisces 类型不能用 terrorist 响应 move）', () => {
    let s = sceneTerroristVsThief();
    s = {
      ...s,
      pendingShootResponse: {
        shooterID: 'p1',
        targetPlayerID: 'p2',
        cardId: SHOOT,
        sameLayerRequired: true,
        deathFaces: [1],
        moveFaces: [2, 3, 4],
        extraOnMove: null,
        responseType: 'pisces',
      },
    };
    const r = callMove(s, 'respondTerroristDiscard', [KICK], { currentPlayer: 'p2' });
    expect(r).toBe('INVALID_MOVE');
  });
});

// ============================================================================
// C. respondTerroristAccept
// ============================================================================

describe('恐怖分子 · 狂热 · respondTerroristAccept', () => {
  it('正确路径：target 拒弃 → 重入 SHOOT 应用 -1 惩罚（rolls=1 → 0 miss）', () => {
    const initial = sceneTerroristVsThief();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    const r2 = callMove(after1, 'respondTerroristAccept', [], {
      currentPlayer: 'p2',
      rolls: [1],
    });
    expect(r2).not.toBe('INVALID_MOVE');
    const next = r2 as SetupState;
    expect(next.pendingShootResponse).toBeNull();
    // -1 后 0 miss（不在 deathFaces 也不在 moveFaces）
    expect(next.players.p2!.isAlive).toBe(true);
    // SHOOT 卡已弃
    expect(next.players.p1!.hand).not.toContain(SHOOT);
    // lastShootRoll 记录原始 D6（1）供动画展示
    expect(next.lastShootRoll).toBe(1);
  });

  it('正确路径：rolls=2 → 1 kill（-1 后命中 deathFaces=[1]）', () => {
    const initial = sceneTerroristVsThief();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    const r2 = callMove(after1, 'respondTerroristAccept', [], {
      currentPlayer: 'p2',
      rolls: [2],
    });
    expect(r2).not.toBe('INVALID_MOVE');
    const next = r2 as SetupState;
    expect(next.players.p2!.isAlive).toBe(false);
    // 原始 2，惩罚后 1，命中 deathFaces=[1]
    expect(next.lastShootRoll).toBe(2);
  });

  it('正确路径：rolls=5 → 4 move（-1 后命中 moveFaces=[2,3,4]）', () => {
    const initial = sceneTerroristVsThief();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    const r2 = callMove(after1, 'respondTerroristAccept', [], {
      currentPlayer: 'p2',
      rolls: [5],
    });
    expect(r2).not.toBe('INVALID_MOVE');
    const next = r2 as SetupState;
    // p2 在 L2 → choices=[1,3] → 挂起 pendingShootMove
    expect(next.pendingShootMove).not.toBeNull();
  });

  it('拒绝：非 target 本人发起', () => {
    const initial = sceneTerroristVsThief();
    const r1 = callMove(initial, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;

    const r2 = callMove(after1, 'respondTerroristAccept', [], { currentPlayer: 'p3' });
    expect(r2).toBe('INVALID_MOVE');
  });
});

// ============================================================================
// D. 与 Pisces 共存（双鱼 SHOOT 优先 Pisces 窗口）
// ============================================================================

describe('恐怖分子 · 狂热 · 与 Pisces 共存', () => {
  it('恐怖分子 SHOOT 双鱼 → Pisces 窗口优先（响应链路：Pisces evade → Terrorist 不再触发）', () => {
    let s = sceneTerroristVsThief();
    s = {
      ...s,
      players: {
        ...s.players,
        p2: { ...s.players.p2!, characterId: 'thief_pisces' as CardID, currentLayer: 2 as Layer },
      },
    };
    const r1 = callMove(s, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;
    expect(after1.pendingShootResponse).not.toBeNull();
    expect(after1.pendingShootResponse!.responseType).toBe('pisces');

    // 双鱼闪避后 SHOOT 完全取消，不进入 Terrorist 窗口
    const r2 = callMove(after1, 'respondShootEvade', [], { currentPlayer: 'p2' });
    expect(r2).not.toBe('INVALID_MOVE');
    const next = r2 as SetupState;
    expect(next.pendingShootResponse).toBeNull();
    expect(next.players.p2!.currentLayer).toBe(1);
  });

  it('恐怖分子 SHOOT 双鱼 → Pisces pass 后进入 Terrorist 窗口', () => {
    let s = sceneTerroristVsThief();
    s = {
      ...s,
      players: {
        ...s.players,
        p2: {
          ...s.players.p2!,
          characterId: 'thief_pisces' as CardID,
          currentLayer: 2 as Layer,
          hand: [KICK],
        },
      },
    };
    const r1 = callMove(s, 'playShoot', ['p2', SHOOT], { currentPlayer: 'p1' });
    const after1 = r1 as SetupState;
    expect(after1.pendingShootResponse!.responseType).toBe('pisces');

    // 双鱼 pass → 重入应触发 Terrorist 窗口
    const r2 = callMove(after1, 'respondShootPass', [], {
      currentPlayer: 'p2',
      rolls: [4],
    });
    expect(r2).not.toBe('INVALID_MOVE');
    const next = r2 as SetupState;
    expect(next.pendingShootResponse).not.toBeNull();
    expect(next.pendingShootResponse!.responseType).toBe('terrorist');
  });
});
