// 核心 Move 测试

import { describe, it, expect } from 'vitest';
import { createInitialState, type SetupState, type PlayerSetup } from './setup.js';
import type { CardID, Layer } from '@icgame/shared';
import {
  drawCards,
  discardCard,
  discardToLimit,
  getDiscardCount,
  beginTurn,
  endTurn,
  setTurnPhase,
  movePlayerToLayer,
  isAdjacentLayer,
  incrementMoveCounter,
  applyUnlockSuccess,
  applyUnlockCancel,
} from './moves.js';

// 共享测试 fixture
function makeState(overrides?: Partial<SetupState>): SetupState {
  const s = createInitialState({
    playerCount: 4,
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    nicknames: ['A', 'B', 'C', 'D'],
    rngSeed: 'test',
  });
  const base: SetupState = {
    ...s,
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'P1',
    dreamMasterID: 'P4',
    players: {
      ...s.players,
      P1: { ...s.players.P1!, hand: ['c1', 'c2', 'c3'] as CardID[], currentLayer: 1 as Layer },
      P2: { ...s.players.P2!, hand: ['c4'] as CardID[], currentLayer: 2 as Layer },
      P3: { ...s.players.P3!, hand: [] as CardID[], currentLayer: 3 as Layer },
      P4: { ...s.players.P4!, faction: 'master', currentLayer: 4 as Layer },
    },
    deck: {
      cards: ['d1', 'd2', 'd3', 'd4'] as CardID[],
      discardPile: [] as CardID[],
    },
    layers: {
      ...s.layers,
      1: { ...s.layers[1]!, playersInLayer: ['P1'], heartLockValue: 2 },
      2: { ...s.layers[2]!, playersInLayer: ['P2'] },
      3: { ...s.layers[3]!, playersInLayer: ['P3'] },
      4: { ...s.layers[4]!, playersInLayer: ['P4'] },
    },
  };
  return { ...base, ...overrides };
}

describe('moves', () => {
  // === drawCards ===
  describe('drawCards', () => {
    it('draws default 2 cards from deck to hand', () => {
      const s = makeState();
      const result = drawCards(s, 'P1');
      expect(result.players.P1!.hand).toEqual(['c1', 'c2', 'c3', 'd1', 'd2']);
      expect(result.deck.cards).toEqual(['d3', 'd4']);
    });

    it('draws specified count', () => {
      const s = makeState();
      const result = drawCards(s, 'P1', 3);
      expect(result.players.P1!.hand).toEqual(['c1', 'c2', 'c3', 'd1', 'd2', 'd3']);
    });

    it('returns unchanged state for unknown player', () => {
      const s = makeState();
      const result = drawCards(s, 'UNKNOWN');
      expect(result).toBe(s);
    });

    it('returns unchanged state when deck is empty', () => {
      const s = makeState({ deck: { cards: [], discardPile: [] } });
      const result = drawCards(s, 'P1');
      expect(result).toBe(s);
    });
  });

  // === discardCard ===
  describe('discardCard', () => {
    it('removes card from hand and adds to discard pile', () => {
      const s = makeState();
      const result = discardCard(s, 'P1', 'c2');
      expect(result.players.P1!.hand).toEqual(['c1', 'c3']);
      expect(result.deck.discardPile).toEqual(['c2']);
    });

    it('returns unchanged state for card not in hand', () => {
      const s = makeState();
      const result = discardCard(s, 'P1', 'not-exist');
      expect(result).toBe(s);
    });

    it('returns unchanged state for unknown player', () => {
      const s = makeState();
      const result = discardCard(s, 'UNKNOWN', 'c1');
      expect(result).toBe(s);
    });
  });

  // === discardToLimit ===
  describe('discardToLimit', () => {
    it('discards multiple specified cards', () => {
      const s = makeState();
      const result = discardToLimit(s, 'P1', ['c1', 'c3']);
      expect(result.players.P1!.hand).toEqual(['c2']);
      expect(result.deck.discardPile).toEqual(['c1', 'c3']);
    });

    it('skips cards not in hand silently', () => {
      const s = makeState();
      const result = discardToLimit(s, 'P1', ['c1', 'not-exist']);
      expect(result.players.P1!.hand).toEqual(['c2', 'c3']);
      expect(result.deck.discardPile).toEqual(['c1']);
    });
  });

  // === getDiscardCount ===
  describe('getDiscardCount', () => {
    it('returns 0 when within limit', () => {
      expect(getDiscardCount({ hand: ['a', 'b', 'c'] } as PlayerSetup)).toBe(0);
    });

    it('returns excess when over limit', () => {
      expect(getDiscardCount({ hand: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } as PlayerSetup)).toBe(2);
    });

    it('returns 0 when exactly at limit', () => {
      expect(getDiscardCount({ hand: ['a', 'b', 'c', 'd', 'e'] } as PlayerSetup)).toBe(0);
    });
  });

  // === beginTurn ===
  describe('beginTurn', () => {
    it('sets turn phase to draw and increments turn number', () => {
      const s = makeState({ turnNumber: 5 });
      const result = beginTurn(s, 'P2');
      expect(result.turnPhase).toBe('draw');
      expect(result.turnNumber).toBe(6);
      expect(result.currentPlayerID).toBe('P2');
    });

    it('resets skill usage and unlock counters for player', () => {
      const s = makeState({
        players: {
          ...makeState().players,
          P2: {
            ...makeState().players.P2!,
            skillUsedThisTurn: { skill1: 1 },
            successfulUnlocksThisTurn: 3,
          },
        },
      });
      const result = beginTurn(s, 'P2');
      expect(result.players.P2!.skillUsedThisTurn).toEqual({});
      expect(result.players.P2!.successfulUnlocksThisTurn).toBe(0);
    });

    it('returns unchanged state for unknown player', () => {
      const s = makeState();
      expect(beginTurn(s, 'UNKNOWN')).toBe(s);
    });
  });

  // === endTurn ===
  describe('endTurn', () => {
    it('advances to next player in order', () => {
      const s = makeState({
        playerOrder: ['P1', 'P2', 'P3', 'P4'],
        currentPlayerID: 'P1',
      });
      const result = endTurn(s);
      expect(result.currentPlayerID).toBe('P2');
      expect(result.turnPhase).toBe('turnEnd');
    });

    it('wraps around to first player', () => {
      const s = makeState({
        playerOrder: ['P1', 'P2', 'P3', 'P4'],
        currentPlayerID: 'P4',
      });
      const result = endTurn(s);
      expect(result.currentPlayerID).toBe('P1');
    });
  });

  // === setTurnPhase ===
  describe('setTurnPhase', () => {
    it('sets the turn phase', () => {
      const s = makeState({ turnPhase: 'draw' });
      expect(setTurnPhase(s, 'action').turnPhase).toBe('action');
      expect(setTurnPhase(s, 'discard').turnPhase).toBe('discard');
    });
  });

  // === movePlayerToLayer ===
  describe('movePlayerToLayer', () => {
    it('moves player from one layer to another', () => {
      const s = makeState();
      const result = movePlayerToLayer(s, 'P1', 3);
      expect(result.players.P1!.currentLayer).toBe(3);
      expect(result.layers[1]!.playersInLayer).not.toContain('P1');
      expect(result.layers[3]!.playersInLayer).toContain('P1');
    });

    it('adds to target layer without removing existing players', () => {
      const s = makeState({
        layers: {
          ...makeState().layers,
          2: { ...makeState().layers[2]!, playersInLayer: ['P2'] },
        },
      });
      const result = movePlayerToLayer(s, 'P1', 2);
      expect(result.layers[2]!.playersInLayer).toEqual(['P2', 'P1']);
    });

    it('returns unchanged state for unknown player', () => {
      const s = makeState();
      expect(movePlayerToLayer(s, 'UNKNOWN', 3)).toBe(s);
    });

    // W19-B Bug fix · 同层移动不应造成 playersInLayer 重复
    it('targetLayer === currentLayer 时 no-op，不重复 playerID', () => {
      const s = makeState();
      const result = movePlayerToLayer(s, 'P1', 1); // P1 已在 layer 1
      expect(result).toBe(s);
      expect(result.layers[1]!.playersInLayer.filter((id) => id === 'P1')).toHaveLength(1);
    });

    // 防御性 dedupe：若 target 层数组已含该 playerID（异常 state），不再重复加
    it('防御性 dedupe：target 层已含 playerID 时不再追加', () => {
      const s = makeState({
        layers: {
          ...makeState().layers,
          2: { ...makeState().layers[2]!, playersInLayer: ['P1', 'P2'] },
        },
      });
      const result = movePlayerToLayer(s, 'P1', 2);
      expect(result.layers[2]!.playersInLayer.filter((id) => id === 'P1')).toHaveLength(1);
    });
  });

  // === isAdjacentLayer ===
  describe('isAdjacentLayer', () => {
    it('returns true for adjacent layers', () => {
      expect(isAdjacentLayer(1, 2)).toBe(true);
      expect(isAdjacentLayer(3, 2)).toBe(true);
      expect(isAdjacentLayer(3, 4)).toBe(true);
    });

    it('returns false for non-adjacent layers', () => {
      expect(isAdjacentLayer(1, 3)).toBe(false);
      expect(isAdjacentLayer(1, 4)).toBe(false);
    });

    it('returns false for same layer', () => {
      expect(isAdjacentLayer(2, 2)).toBe(false);
    });
  });

  // === incrementMoveCounter ===
  describe('incrementMoveCounter', () => {
    it('increments move counter by 1', () => {
      const s = makeState({ moveCounter: 5 });
      expect(incrementMoveCounter(s).moveCounter).toBe(6);
    });
  });

  // === applyUnlockSuccess ===
  describe('applyUnlockSuccess', () => {
    it('decrements heart lock and clears pending unlock', () => {
      const s = makeState({
        pendingUnlock: { playerID: 'P1', layer: 1, cardId: 'unlock-1' as CardID },
        layers: {
          ...makeState().layers,
          1: { ...makeState().layers[1]!, heartLockValue: 3 },
        },
      });
      const result = applyUnlockSuccess(s);
      expect(result.layers[1]!.heartLockValue).toBe(2);
      expect(result.pendingUnlock).toBeNull();
      expect(result.players.P1!.successfulUnlocksThisTurn).toBe(1);
      expect(result.players.P1!.unlockCount).toBe(1);
    });

    it('opens vault when heart lock reaches zero', () => {
      const s = makeState({
        pendingUnlock: { playerID: 'P1', layer: 1, cardId: 'unlock-1' as CardID },
        layers: {
          ...makeState().layers,
          1: { ...makeState().layers[1]!, heartLockValue: 1 },
        },
        vaults: [
          { id: 'v1', layer: 1 as Layer, contentType: 'secret', isOpened: false, openedBy: null },
        ],
      });
      const result = applyUnlockSuccess(s);
      expect(result.layers[1]!.heartLockValue).toBe(0);
      expect(result.vaults[0]!.isOpened).toBe(true);
      expect(result.vaults[0]!.openedBy).toBe('P1');
    });

    it('does not open vault when heart lock is still positive', () => {
      const s = makeState({
        pendingUnlock: { playerID: 'P1', layer: 1, cardId: 'unlock-1' as CardID },
        layers: {
          ...makeState().layers,
          1: { ...makeState().layers[1]!, heartLockValue: 2 },
        },
        vaults: [
          { id: 'v1', layer: 1 as Layer, contentType: 'secret', isOpened: false, openedBy: null },
        ],
      });
      const result = applyUnlockSuccess(s);
      expect(result.vaults[0]!.isOpened).toBe(false);
    });

    it('returns unchanged state when no pending unlock', () => {
      const s = makeState({ pendingUnlock: null });
      expect(applyUnlockSuccess(s)).toBe(s);
    });

    it('returns unchanged state when layer does not exist', () => {
      const s = makeState({
        pendingUnlock: { playerID: 'P1', layer: 99, cardId: 'unlock-1' as CardID },
      });
      expect(applyUnlockSuccess(s)).toBe(s);
    });
  });

  // === applyUnlockCancel ===
  describe('applyUnlockCancel', () => {
    it('clears pending unlock', () => {
      const s = makeState({
        pendingUnlock: { playerID: 'P1', layer: 1, cardId: 'unlock-1' as CardID },
      });
      expect(applyUnlockCancel(s).pendingUnlock).toBeNull();
    });

    it('leaves state unchanged when already null', () => {
      const s = makeState({ pendingUnlock: null });
      expect(applyUnlockCancel(s).pendingUnlock).toBeNull();
    });
  });
});
