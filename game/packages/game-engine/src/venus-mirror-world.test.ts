// 金星·镜界世界观 · 复制效果测试
// 对照：docs/manual/06-dream-master.md 金星·镜界

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { applyVenusMirrorWorld, VENUS_MIRROR_WORLD_SKILL_ID } from './engine/skills.js';

function setupVenusMirror() {
  let s = scenarioStartOfGame3p();
  s = {
    ...s,
    turnPhase: 'action',
    currentPlayerID: 'p1',
    players: {
      ...s.players,
      p1: {
        ...s.players.p1!,
        currentLayer: 1,
        hand: ['action_unlock' as CardID, 'action_shoot' as CardID, 'action_kick' as CardID],
      },
      p2: {
        ...s.players.p2!,
        currentLayer: 1,
        hand: ['action_dream_transit' as CardID],
      },
      pM: { ...s.players.pM!, characterId: 'dm_venus_mirror' as CardID, currentLayer: 1 },
    },
    layers: {
      ...s.layers,
      1: { ...s.layers[1]!, playersInLayer: ['p1', 'p2', 'pM'], heartLockValue: 3 },
    },
    playedCardsThisTurn: ['action_shoot' as CardID],
  };
  return s;
}

describe('金星·镜界世界观（useVenusMirrorWorld）', () => {
  it('复制 SHOOT → roll=1 → kill', () => {
    const s = setupVenusMirror();
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_unlock', 'action_kick'], 1);
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(false);
    expect(r!.players.p1!.hand).not.toContain('action_unlock');
    expect(r!.players.p1!.hand).not.toContain('action_kick');
  });

  it('复制 SHOOT → roll=3 → move', () => {
    const s = setupVenusMirror();
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_unlock', 'action_kick'], 3);
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(true);
    expect(r!.players.p2!.currentLayer).toBe(2);
  });

  it('复制 SHOOT → roll=6 → miss', () => {
    const s = setupVenusMirror();
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_unlock', 'action_kick'], 6);
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(true);
    expect(r!.players.p2!.currentLayer).toBe(1);
  });

  it('复制 KICK → 击杀+拿手牌', () => {
    let s = setupVenusMirror();
    s = { ...s, playedCardsThisTurn: ['action_kick' as CardID] };
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_unlock', 'action_shoot'], 0);
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(false);
    expect(r!.players.p1!.hand).toContain('action_dream_transit');
  });

  it('无可复制牌 → null', () => {
    let s = setupVenusMirror();
    s = { ...s, playedCardsThisTurn: ['action_unlock' as CardID] };
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_unlock', 'action_kick'], 1);
    expect(r).toBeNull();
  });

  it('playedCardsThisTurn 为空 → null', () => {
    let s = setupVenusMirror();
    s = { ...s, playedCardsThisTurn: [] };
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_unlock', 'action_kick'], 1);
    expect(r).toBeNull();
  });

  it('梦主非金星 → null', () => {
    let s = setupVenusMirror();
    s = {
      ...s,
      players: { ...s.players, pM: { ...s.players.pM!, characterId: 'dm_architect' as CardID } },
    };
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_unlock', 'action_kick'], 1);
    expect(r).toBeNull();
  });

  it('技能已使用 1 次 → null', () => {
    let s = setupVenusMirror();
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, skillUsedThisTurn: { [VENUS_MIRROR_WORLD_SKILL_ID]: 1 } },
      },
    };
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_unlock', 'action_kick'], 1);
    expect(r).toBeNull();
  });

  it('弃牌数不为 2 → null', () => {
    const s = setupVenusMirror();
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_unlock'], 1);
    expect(r).toBeNull();
  });

  it('弃牌不在手中 → null', () => {
    const s = setupVenusMirror();
    const r = applyVenusMirrorWorld(s, 'p1', 'p2', ['action_kick', 'action_dream_transit'], 1);
    expect(r).toBeNull();
  });

  it('move 接入测试', () => {
    const s = setupVenusMirror();
    const r = callMove(s, 'useVenusMirrorWorld', ['p2', ['action_unlock', 'action_kick']], {
      currentPlayer: 'p1',
      rolls: [1],
    });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });

  it('非行动阶段 → INVALID_MOVE', () => {
    let s = setupVenusMirror();
    s = { ...s, turnPhase: 'draw' };
    const r = callMove(s, 'useVenusMirrorWorld', ['p2', ['action_unlock', 'action_kick']], {
      currentPlayer: 'p1',
    });
    expect(r).toBe('INVALID_MOVE');
  });
});
