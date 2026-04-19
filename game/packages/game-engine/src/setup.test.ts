// 游戏初始化 Setup 测试

import { describe, it, expect } from 'vitest';
import { createInitialState } from './setup.js';
import {
  PLAYER_COUNT_CONFIGS,
  LAYER_COUNT,
  VAULT_SECRET_COUNT,
  VAULT_COIN_COUNT,
} from './config.js';

describe('setup', () => {
  describe('createInitialState', () => {
    it('creates state for 4 players', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'test',
      });

      expect(s.playerOrder).toEqual(['P1', 'P2', 'P3', 'P4']);
      expect(Object.keys(s.players)).toHaveLength(4);
      expect(s.phase).toBe('setup');
      expect(s.turnNumber).toBe(0);
      expect(s.rngSeed).toBe('test');
    });

    it('assigns nicknames correctly', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2'],
        nicknames: ['Alice', 'Bob'],
        rngSeed: 'seed',
      });
      expect(s.players.P1!.nickname).toBe('Alice');
      expect(s.players.P2!.nickname).toBe('Bob');
    });

    it('fills default nicknames when not provided', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: [],
        rngSeed: 'seed',
      });
      expect(s.players.P1!.nickname).toBe('Player 1');
      expect(s.players.P4!.nickname).toBe('Player 4');
    });

    it('throws for unsupported player count', () => {
      expect(() =>
        createInitialState({
          playerCount: 3,
          playerIds: ['P1', 'P2', 'P3'],
          nicknames: ['A', 'B', 'C'],
          rngSeed: 'seed',
        }),
      ).toThrow('Unsupported player count');
    });

    it('initializes all players as thief faction', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
      });
      for (const id of s.playerOrder) {
        expect(s.players[id]!.faction).toBe('thief');
      }
    });

    it('initializes players with empty hand and alive status', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
      });
      const p = s.players.P1!;
      expect(p.hand).toEqual([]);
      expect(p.isAlive).toBe(true);
      expect(p.deathTurn).toBeNull();
      expect(p.unlockCount).toBe(0);
      expect(p.shootCount).toBe(0);
      expect(p.skillUsedThisTurn).toEqual({});
    });

    it('creates layers 1 through LAYER_COUNT with correct heart lock values', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
      });
      const expectedLocks = PLAYER_COUNT_CONFIGS[4]!.heartLocks;
      for (let l = 1; l <= LAYER_COUNT; l++) {
        expect(s.layers[l]).toBeDefined();
        expect(s.layers[l]!.heartLockValue).toBe(expectedLocks[l - 1]);
        expect(s.layers[l]!.nightmareRevealed).toBe(false);
        expect(s.layers[l]!.nightmareTriggered).toBe(false);
      }
    });

    it('places all players in layer 1 initially', () => {
      const s = createInitialState({
        playerCount: 5,
        playerIds: ['P1', 'P2', 'P3', 'P4', 'P5'],
        nicknames: ['A', 'B', 'C', 'D', 'E'],
        rngSeed: 'seed',
      });
      expect(s.layers[1]!.playersInLayer).toEqual(['P1', 'P2', 'P3', 'P4', 'P5']);
      for (let l = 2; l <= LAYER_COUNT; l++) {
        expect(s.layers[l]!.playersInLayer).toEqual([]);
      }
    });

    it('creates correct number of vaults', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
      });
      const totalVaults = VAULT_SECRET_COUNT + VAULT_COIN_COUNT;
      expect(s.vaults).toHaveLength(totalVaults);
    });

    it('creates correct vault content types', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
      });
      const secrets = s.vaults.filter((v) => v.contentType === 'secret');
      const coins = s.vaults.filter((v) => v.contentType === 'coin');
      expect(secrets).toHaveLength(VAULT_SECRET_COUNT);
      expect(coins).toHaveLength(VAULT_COIN_COUNT);
    });

    it('all vaults start closed', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
      });
      for (const v of s.vaults) {
        expect(v.isOpened).toBe(false);
        expect(v.openedBy).toBeNull();
      }
    });

    it('uses default ruleVariant classic', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
      });
      expect(s.ruleVariant).toBe('classic');
      expect(s.exCardsEnabled).toBe(false);
      expect(s.expansionEnabled).toBe(false);
    });

    it('sets custom options', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
        ruleVariant: 'variant',
        exCardsEnabled: true,
        expansionEnabled: true,
      });
      expect(s.ruleVariant).toBe('variant');
      expect(s.exCardsEnabled).toBe(true);
      expect(s.expansionEnabled).toBe(true);
    });

    it('initializes empty bribe pool and deck with action cards', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
      });
      expect(s.bribePool).toEqual([]);
      // 牌库被初始化为已洗牌的行动牌（不含 action_back 占位牌）
      expect(s.deck.cards.length).toBeGreaterThan(0);
      expect(s.deck.cards).not.toContain('action_back');
      expect(s.deck.discardPile).toEqual([]);
    });

    it('deck shuffle is deterministic per seed', () => {
      const a = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed-x',
      });
      const b = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed-x',
      });
      expect(b.deck.cards).toEqual(a.deck.cards);
    });

    it('works for max player count (10)', () => {
      const ids = Array.from({ length: 10 }, (_, i) => `P${i + 1}`);
      const s = createInitialState({
        playerCount: 10,
        playerIds: ids,
        nicknames: ids,
        rngSeed: 'seed',
      });
      expect(s.playerOrder).toHaveLength(10);
      expect(Object.keys(s.players)).toHaveLength(10);
    });
  });
});
