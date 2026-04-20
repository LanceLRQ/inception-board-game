// 格林射线·缉捕 move 测试
// 对照：docs/manual/05-dream-thieves.md 格林射线

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';

function setupGreenRay() {
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
        characterId: 'thief_green_ray' as CardID,
        currentLayer: 1,
        hand: ['action_dream_transit' as CardID, 'action_shoot' as CardID],
      },
      p2: {
        ...s.players.p2!,
        currentLayer: 4,
      },
      pM: {
        ...s.players.pM!,
        currentLayer: 1,
      },
    },
    layers: {
      ...s.layers,
      1: { ...s.layers[1]!, playersInLayer: ['p1', 'pM'] },
      4: { ...s.layers[4]!, playersInLayer: ['p2'] },
    },
  };
  return s;
}

describe('playGreenRayArrest move', () => {
  it('格林射线 弃穿梭剂+SHOOT → 移到目标层 → SHOOT 结算', () => {
    const s = setupGreenRay();
    // p1(L1) 用穿梭剂+SHOOT → 移到 L4 → SHOOT p2(L4)
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expectMoveOk(r);
    // p1 已移到 L4
    expect(r.players.p1!.currentLayer).toBe(4);
    // 穿梭剂已弃
    expect(r.players.p1!.hand).not.toContain('action_dream_transit');
    // SHOOT 已弃（applyShootVariant 处理）
    expect(r.players.p1!.hand).not.toContain('action_shoot');
    // playedCardsThisTurn 记录
    expect(r.playedCardsThisTurn).toContain('action_shoot');
  });

  it('非格林射线角色 → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, characterId: 'thief_architect' as CardID } },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('手牌无穿梭剂 → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, hand: ['action_shoot' as CardID] } },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('手牌无 SHOOT → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, hand: ['action_dream_transit' as CardID] } },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('非 draw 阶段（draw 阶段） → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = { ...s, turnPhase: 'draw' };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('目标是自己 → INVALID_MOVE', () => {
    const s = setupGreenRay();
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p1', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('目标已死亡 → INVALID_MOVE', () => {
    let s = setupGreenRay();
    s = { ...s, players: { ...s.players, p2: { ...s.players.p2!, isAlive: false } } };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('使用 SHOOT·刺客之王 → 正确结算（跨层无限制）', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          hand: ['action_dream_transit' as CardID, 'action_shoot_king' as CardID],
        },
      },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot_king', 'p2', 4], {
      currentPlayer: 'p1',
    });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(4);
    expect(r.playedCardsThisTurn).toContain('action_shoot_king');
  });

  it('使用 SHOOT·爆甲螺旋 → 正确结算', () => {
    let s = setupGreenRay();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          hand: ['action_dream_transit' as CardID, 'action_shoot_burst' as CardID],
        },
        p2: {
          ...s.players.p2!,
          hand: ['action_shoot' as CardID, 'action_unlock' as CardID],
        },
      },
    };
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot_burst', 'p2', 4], {
      currentPlayer: 'p1',
    });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(4);
  });

  it('moveCounter 递增', () => {
    const s = setupGreenRay();
    const before = s.moveCounter;
    const r = callMove(s, 'playGreenRayArrest', ['action_shoot', 'p2', 4], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.moveCounter).toBe(before + 1);
  });
});
