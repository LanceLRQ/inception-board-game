// 复活机制 + 密道世界观测试
// 对照：docs/manual/03-game-flow.md 复活 / docs/manual/06-dream-master.md 密道

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { applyRevive } from './engine/skills.js';

function setupRevive() {
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
        hand: [
          'action_unlock' as CardID,
          'action_shoot' as CardID,
          'action_dream_transit' as CardID,
        ],
      },
      p2: {
        ...s.players.p2!,
        currentLayer: 0,
        isAlive: false,
        deathTurn: 2,
        hand: [],
      },
      pM: { ...s.players.pM!, currentLayer: 1 },
    },
    layers: {
      ...s.layers,
      0: { ...s.layers[0]!, playersInLayer: ['p2'] },
      1: { ...s.layers[1]!, playersInLayer: ['p1', 'pM'], heartLockValue: 3 },
    },
  };
  return s;
}

describe('基础复活（弃 2 张手牌）', () => {
  it('复活他人 → 目标移到 p1 所在层', () => {
    const s = setupRevive();
    const r = applyRevive(s, 'p1', 'p2', ['action_unlock', 'action_shoot']);
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(true);
    expect(r!.players.p2!.deathTurn).toBeNull();
    expect(r!.players.p2!.currentLayer).toBe(1);
    expect(r!.players.p1!.hand).not.toContain('action_unlock');
    expect(r!.players.p1!.hand).not.toContain('action_shoot');
  });

  it('复活自己 → 移到第 1 层', () => {
    let s = setupRevive();
    // p1 在迷失层且已死亡
    s = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1!,
          currentLayer: 0,
          isAlive: false,
          deathTurn: 3,
          hand: ['action_unlock' as CardID, 'action_shoot' as CardID],
        },
        p2: { ...s.players.p2!, currentLayer: 1, isAlive: true },
      },
    };
    const r = applyRevive(s, 'p1', null, ['action_unlock', 'action_shoot']);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.isAlive).toBe(true);
    expect(r!.players.p1!.currentLayer).toBe(1);
  });

  it('手牌不足 2 张 → null', () => {
    let s = setupRevive();
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, hand: ['action_unlock'] } } };
    const r = applyRevive(s, 'p1', 'p2', ['action_unlock', 'action_shoot']);
    expect(r).toBeNull();
  });

  it('目标未死亡 → null', () => {
    let s = setupRevive();
    s = {
      ...s,
      players: { ...s.players, p2: { ...s.players.p2!, isAlive: true, currentLayer: 1 } },
    };
    const r = applyRevive(s, 'p1', 'p2', ['action_unlock', 'action_shoot']);
    expect(r).toBeNull();
  });

  it('自己在迷失层复活他人 → null', () => {
    let s = setupRevive();
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, currentLayer: 0 } } };
    const r = applyRevive(s, 'p1', 'p2', ['action_unlock', 'action_shoot']);
    expect(r).toBeNull();
  });
});

describe('密道世界观（弃 1 张穿梭剂复活）', () => {
  it('密道世界观 + 弃 1 穿梭剂 → 复活成功', () => {
    const s = setupRevive();
    // 设定梦主为密道
    const st = {
      ...s,
      players: {
        ...s.players,
        pM: { ...s.players.pM!, characterId: 'dm_secret_passage' as CardID },
      },
    };
    const r = applyRevive(st, 'p1', 'p2', ['action_dream_transit']);
    expect(r).not.toBeNull();
    expect(r!.players.p2!.isAlive).toBe(true);
    expect(r!.players.p2!.currentLayer).toBe(1);
  });

  it('密道世界观 + 弃 2 张非穿梭剂 → null', () => {
    const s = setupRevive();
    const st = {
      ...s,
      players: {
        ...s.players,
        pM: { ...s.players.pM!, characterId: 'dm_secret_passage' as CardID },
      },
    };
    const r = applyRevive(st, 'p1', 'p2', ['action_unlock', 'action_shoot']);
    expect(r).toBeNull();
  });

  it('密道世界观 + 弃 1 张非穿梭剂 → null', () => {
    const s = setupRevive();
    const st = {
      ...s,
      players: {
        ...s.players,
        pM: { ...s.players.pM!, characterId: 'dm_secret_passage' as CardID },
      },
    };
    const r = applyRevive(st, 'p1', 'p2', ['action_unlock']);
    expect(r).toBeNull();
  });

  it('非密道世界观 + 弃 1 张穿梭剂 → null（需 2 张）', () => {
    const s = setupRevive();
    const r = applyRevive(s, 'p1', 'p2', ['action_dream_transit']);
    expect(r).toBeNull();
  });
});

describe('move playRevive', () => {
  it('弃 2 张 → 复活 p2', () => {
    const s = setupRevive();
    const r = callMove(s, 'playRevive', ['p2', ['action_unlock', 'action_shoot']], {
      currentPlayer: 'p1',
    });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(true);
  });

  it('非行动阶段 → INVALID_MOVE', () => {
    let s = setupRevive();
    s = { ...s, turnPhase: 'draw' };
    const r = callMove(s, 'playRevive', ['p2', ['action_unlock', 'action_shoot']], {
      currentPlayer: 'p1',
    });
    expect(r).toBe('INVALID_MOVE');
  });

  it('弃牌不在手中 → INVALID_MOVE', () => {
    const s = setupRevive();
    const r = callMove(s, 'playRevive', ['p2', ['action_kick', 'action_shift']], {
      currentPlayer: 'p1',
    });
    expect(r).toBe('INVALID_MOVE');
  });
});
