// 皇城世界观 · 贿赂后 SHOOT 测试
// 对照：docs/manual/06-dream-master.md 皇城

import { describe, expect, it } from 'vitest';
import type { CardID } from '@icgame/shared';
import { scenarioStartOfGame3p } from './testing/scenarios.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { applyImperialCityWorldShoot } from './engine/skills.js';

function setupImperialCity() {
  let s = scenarioStartOfGame3p();
  s = {
    ...s,
    turnPhase: 'action',
    currentPlayerID: 'p2',
    players: {
      ...s.players,
      p1: { ...s.players.p1!, currentLayer: 1, bribeReceived: 0 },
      p2: { ...s.players.p2!, currentLayer: 1, bribeReceived: 1 },
      pM: { ...s.players.pM!, characterId: 'dm_imperial_city' as CardID, currentLayer: 1 },
    },
    layers: {
      ...s.layers,
      1: { ...s.layers[1]!, playersInLayer: ['p1', 'p2', 'pM'], heartLockValue: 3 },
    },
  };
  return s;
}

describe('皇城世界观 · 贿赂后 SHOOT', () => {
  describe('纯函数 applyImperialCityWorldShoot', () => {
    it('roll=4, -3=1 → kill（deathFace=1）', () => {
      const s = setupImperialCity();
      const r = applyImperialCityWorldShoot(s, 'p2', 'p1', 4);
      expect(r).not.toBeNull();
      expect(r!.players.p1!.isAlive).toBe(false);
    });

    it('roll=5, -3=2 → move（moveFace=2）', () => {
      const s = setupImperialCity();
      const r = applyImperialCityWorldShoot(s, 'p2', 'p1', 5);
      expect(r).not.toBeNull();
      expect(r!.players.p1!.isAlive).toBe(true);
      expect(r!.players.p1!.currentLayer).toBe(2);
    });

    it('roll=6, -3=3 → move（moveFace=3）', () => {
      const s = setupImperialCity();
      const r = applyImperialCityWorldShoot(s, 'p2', 'p1', 6);
      expect(r).not.toBeNull();
      expect(r!.players.p1!.isAlive).toBe(true);
      expect(r!.players.p1!.currentLayer).toBe(2);
    });

    it('roll=3, -3=1(capped) → kill', () => {
      const s = setupImperialCity();
      const r = applyImperialCityWorldShoot(s, 'p2', 'p1', 3);
      expect(r).not.toBeNull();
      expect(r!.players.p1!.isAlive).toBe(false);
    });

    it('目标已收到贿赂 → null', () => {
      const s = setupImperialCity();
      // p2 bribeReceived=1 → 作为 target 时拒绝
      const r = applyImperialCityWorldShoot(s, 'p1', 'p2', 4);
      expect(r).toBeNull();
    });

    it('shooter = target → null', () => {
      const s = setupImperialCity();
      const r = applyImperialCityWorldShoot(s, 'p2', 'p2', 4);
      expect(r).toBeNull();
    });
  });

  describe('move useImperialCityWorldShoot', () => {
    it('p2（收到贿赂）选 p1（未收到）→ 正常触发', () => {
      const s = setupImperialCity();
      // roll=4 → modified=1 → kill
      const r = callMove(s, 'useImperialCityWorldShoot', ['p1'], {
        currentPlayer: 'p2',
        rolls: [4],
      });
      expectMoveOk(r);
      expect(r.players.p1!.isAlive).toBe(false);
    });

    it('梦主非皇城 → INVALID_MOVE', () => {
      let s = setupImperialCity();
      s = {
        ...s,
        players: { ...s.players, pM: { ...s.players.pM!, characterId: 'dm_architect' as CardID } },
      };
      const r = callMove(s, 'useImperialCityWorldShoot', ['p1'], { currentPlayer: 'p2' });
      expect(r).toBe('INVALID_MOVE');
    });

    it('非行动阶段 → INVALID_MOVE', () => {
      let s = setupImperialCity();
      s = { ...s, turnPhase: 'draw' };
      const r = callMove(s, 'useImperialCityWorldShoot', ['p1'], { currentPlayer: 'p2' });
      expect(r).toBe('INVALID_MOVE');
    });
  });
});
