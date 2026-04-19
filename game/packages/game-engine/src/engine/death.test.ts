// 死亡 + 迷失层测试

import { describe, it, expect } from 'vitest';
import { createInitialState, type SetupState } from '../setup.js';
import {
  LOST_LAYER,
  canAct,
  applyDeath,
  allThievesDead,
  getAlivePlayers,
  getAliveInLayer,
} from './death.js';
import type { CardID, Layer } from '@icgame/shared';

function makeState(): SetupState {
  const s = createInitialState({
    playerCount: 4,
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    nicknames: ['A', 'B', 'C', 'D'],
    rngSeed: 'seed',
  });
  return {
    ...s,
    phase: 'playing',
    turnNumber: 3,
    dreamMasterID: 'P4',
    players: {
      ...s.players,
      P1: {
        ...s.players.P1!,
        hand: ['c1', 'c2'] as CardID[],
        currentLayer: 2 as Layer,
      },
      P2: { ...s.players.P2!, hand: ['c3'] as CardID[], currentLayer: 2 as Layer },
      P4: { ...s.players.P4!, faction: 'master', currentLayer: 4 as Layer },
    },
    layers: {
      ...s.layers,
      2: { ...s.layers[2]!, playersInLayer: ['P1', 'P2'] },
      4: { ...s.layers[4]!, playersInLayer: ['P4'] },
    },
  };
}

describe('Death & Lost Layer', () => {
  describe('canAct', () => {
    it('alive player in normal layer can act', () => {
      const s = makeState();
      expect(canAct(s.players.P1!)).toBe(true);
    });
    it('dead player cannot act', () => {
      const s = makeState();
      const dead = { ...s.players.P1!, isAlive: false };
      expect(canAct(dead)).toBe(false);
    });
    it('lost layer player cannot act even if isAlive', () => {
      const s = makeState();
      const lost = { ...s.players.P1!, currentLayer: LOST_LAYER };
      expect(canAct(lost)).toBe(false);
    });
  });

  describe('applyDeath · SHOOT', () => {
    it('marks isAlive=false + moves to lost layer', () => {
      const s = makeState();
      const { state: next } = applyDeath(s, 'P1', 'shoot', 'P2');
      expect(next.players.P1!.isAlive).toBe(false);
      expect(next.players.P1!.currentLayer).toBe(LOST_LAYER);
      expect(next.players.P1!.deathTurn).toBe(3);
    });
    it('transfers hand to killer', () => {
      const s = makeState();
      const { state: next, event } = applyDeath(s, 'P1', 'shoot', 'P2');
      expect(next.players.P2!.hand).toEqual(['c3', 'c1', 'c2']);
      expect(next.players.P1!.hand).toEqual([]);
      expect(event.handTransfer).toEqual(['c1', 'c2']);
    });
    it('killer shootCount increments', () => {
      const s = makeState();
      const { state: next } = applyDeath(s, 'P1', 'shoot', 'P2');
      expect(next.players.P2!.shootCount).toBe(s.players.P2!.shootCount + 1);
    });
    it('removes player from old layer', () => {
      const s = makeState();
      const { state: next } = applyDeath(s, 'P1', 'shoot', 'P2');
      expect(next.layers[2]!.playersInLayer).toEqual(['P2']);
    });
  });

  describe('applyDeath · nightmare', () => {
    it('hand goes to discard pile', () => {
      const s = makeState();
      const { state: next } = applyDeath(s, 'P1', 'nightmare');
      expect(next.deck.discardPile).toContain('c1');
      expect(next.deck.discardPile).toContain('c2');
      expect(next.players.P1!.hand).toEqual([]);
    });
  });

  describe('no-op for already dead', () => {
    it('returns same state', () => {
      const s = makeState();
      const dead = { ...s, players: { ...s.players, P1: { ...s.players.P1!, isAlive: false } } };
      const { state: next, event } = applyDeath(dead, 'P1', 'skill');
      expect(next).toBe(dead);
      expect(event.handTransfer).toEqual([]);
    });
  });

  describe('win condition helpers', () => {
    it('allThievesDead false when at least one alive', () => {
      expect(allThievesDead(makeState())).toBe(false);
    });
    it('allThievesDead true when all thieves dead', () => {
      let s = makeState();
      s = applyDeath(s, 'P1', 'shoot', 'P4').state;
      s = applyDeath(s, 'P2', 'shoot', 'P4').state;
      s = applyDeath(s, 'P3', 'shoot', 'P4').state;
      expect(allThievesDead(s)).toBe(true);
    });
    it('getAlivePlayers excludes dead', () => {
      const s = makeState();
      const dead = applyDeath(s, 'P1', 'shoot', 'P2').state;
      expect(getAlivePlayers(dead)).not.toContain('P1');
      expect(getAlivePlayers(dead)).toContain('P2');
    });
    it('getAliveInLayer filters by layer + alive', () => {
      const s = makeState();
      expect(getAliveInLayer(s, 2).sort()).toEqual(['P1', 'P2']);
      const dead = applyDeath(s, 'P1', 'shoot', 'P2').state;
      expect(getAliveInLayer(dead, 2)).toEqual(['P2']);
    });
  });
});
