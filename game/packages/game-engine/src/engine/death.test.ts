// 死亡 + 迷失层测试

import { describe, it, expect } from 'vitest';
import { createInitialState, type SetupState } from '../setup.js';
import {
  LOST_LAYER,
  canAct,
  killPlayer,
  sendToLimbo,
  getAlivePlayers,
  getAliveInLayer,
} from './death.js';
import { movePlayerToLayer } from '../stateOps.js';
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

  describe('killPlayer', () => {
    it('marks isAlive=false + moves to lost layer', () => {
      const next = killPlayer(makeState(), 'P1', 'P2');
      expect(next.players.P1!.isAlive).toBe(false);
      expect(next.players.P1!.currentLayer).toBe(LOST_LAYER);
      expect(next.players.P1!.deathTurn).toBe(3);
    });
    it('hands the first two cards to the killer', () => {
      const s = makeState();
      const withThree = {
        ...s,
        players: { ...s.players, P1: { ...s.players.P1!, hand: ['c1', 'c2', 'c9'] as CardID[] } },
      };
      const next = killPlayer(withThree, 'P1', 'P2');
      expect(next.players.P2!.hand).toEqual(['c3', 'c1', 'c2']);
      expect(next.players.P1!.hand).toEqual(['c9']);
    });
    it('hands over everything when the victim holds fewer than two', () => {
      const s = makeState();
      const next = killPlayer(s, 'P2', 'P1');
      expect(next.players.P1!.hand).toEqual(['c1', 'c2', 'c3']);
      expect(next.players.P2!.hand).toEqual([]);
    });
    it('honours a larger handover count', () => {
      const s = makeState();
      const withFive = {
        ...s,
        players: {
          ...s.players,
          P1: { ...s.players.P1!, hand: ['a', 'b', 'c', 'd', 'e'] as CardID[] },
        },
      };
      const next = killPlayer(withFive, 'P1', 'P2', Number.POSITIVE_INFINITY);
      expect(next.players.P1!.hand).toEqual([]);
      expect(next.players.P2!.hand).toHaveLength(6);
    });
    it('killer shootCount increments', () => {
      const s = makeState();
      const next = killPlayer(s, 'P1', 'P2');
      expect(next.players.P2!.shootCount).toBe(s.players.P2!.shootCount + 1);
    });
    it('moves the victim between layer rosters', () => {
      const next = killPlayer(makeState(), 'P1', 'P2');
      expect(next.layers[2]!.playersInLayer).toEqual(['P2']);
      expect(next.layers[0]!.playersInLayer).toEqual(['P1']);
    });
    it('is a no-op for a victim already in the lost layer', () => {
      const once = killPlayer(makeState(), 'P1', 'P2');
      expect(killPlayer(once, 'P1', 'P2')).toBe(once);
    });
  });

  describe('sendToLimbo', () => {
    it('marks the player dead and keeps the hand', () => {
      const next = sendToLimbo(makeState(), 'P1');
      expect(next.players.P1!.isAlive).toBe(false);
      expect(next.players.P1!.deathTurn).toBe(3);
      expect(next.players.P1!.currentLayer).toBe(LOST_LAYER);
      expect(next.players.P1!.hand).toEqual(['c1', 'c2']);
      expect(next.deck.discardPile).toEqual([]);
    });
    it('hands nothing to anybody', () => {
      const s = makeState();
      const next = sendToLimbo(s, 'P1');
      for (const id of ['P2', 'P3', 'P4']) {
        expect(next.players[id]!.hand).toEqual(s.players[id]!.hand);
        expect(next.players[id]!.shootCount).toBe(0);
      }
    });
    it('is a no-op for a player already dead in the lost layer', () => {
      const once = sendToLimbo(makeState(), 'P1');
      expect(sendToLimbo(once, 'P1')).toBe(once);
    });
    it('keeps the original death turn when called again', () => {
      const once = sendToLimbo(makeState(), 'P1');
      const later = sendToLimbo({ ...once, turnNumber: 9 }, 'P1');
      expect(later.players.P1!.deathTurn).toBe(3);
    });
  });

  describe('movePlayerToLayer 0', () => {
    it('cannot park an alive player in the lost layer', () => {
      const next = movePlayerToLayer(makeState(), 'P1', 0);
      expect(next.players.P1!.isAlive).toBe(false);
      expect(next.players.P1!.currentLayer).toBe(LOST_LAYER);
    });
  });

  describe('alive-player helpers', () => {
    it('getAlivePlayers excludes dead', () => {
      const s = makeState();
      const dead = killPlayer(s, 'P1', 'P2');
      expect(getAlivePlayers(dead)).not.toContain('P1');
      expect(getAlivePlayers(dead)).toContain('P2');
    });
    it('getAliveInLayer filters by layer + alive', () => {
      const s = makeState();
      expect(getAliveInLayer(s, 2).sort()).toEqual(['P1', 'P2']);
      const dead = killPlayer(s, 'P1', 'P2');
      expect(getAliveInLayer(dead, 2)).toEqual(['P2']);
    });
  });
});
