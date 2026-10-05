// 游戏初始化 Setup 测试

import { describe, it, expect } from 'vitest';
import { createInitialState } from './setup.js';
import { InceptionCityGame } from './game.js';
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

    describe('金库摆放', () => {
      const build = (seed: string) =>
        createInitialState({
          playerCount: 4,
          playerIds: ['P1', 'P2', 'P3', 'P4'],
          nicknames: ['A', 'B', 'C', 'D'],
          rngSeed: seed,
        });
      const seeds = Array.from({ length: 40 }, (_, i) => `vault-seed-${i}`);

      it('秘密金库出现在不止一个层上', () => {
        const layersOfSecret = new Set(
          seeds.map((seed) => build(seed).vaults.find((v) => v.contentType === 'secret')!.layer),
        );
        expect(layersOfSecret.size).toBeGreaterThan(1);
      });

      it('同一个种子两次建局的金库完全相同', () => {
        for (const seed of seeds.slice(0, 5)) {
          expect(build(seed).vaults).toEqual(build(seed).vaults);
        }
      });

      it('每层恰好一个金库，秘密金库恰好一个', () => {
        for (const seed of seeds) {
          const { vaults } = build(seed);
          expect(vaults).toHaveLength(VAULT_SECRET_COUNT + VAULT_COIN_COUNT);
          const layers = vaults.map((v) => v.layer).sort();
          expect(layers).toEqual(Array.from({ length: LAYER_COUNT }, (_, i) => i + 1));
          expect(vaults.filter((v) => v.contentType === 'secret')).toHaveLength(VAULT_SECRET_COUNT);
        }
      });

      it('标识互不重复，且不随内容固定', () => {
        const idsOfSecret = new Set<string>();
        for (const seed of seeds) {
          const { vaults } = build(seed);
          expect(new Set(vaults.map((v) => v.id)).size).toBe(vaults.length);
          idsOfSecret.add(vaults.find((v) => v.contentType === 'secret')!.id);
        }
        expect(idsOfSecret.size).toBeGreaterThan(1);
      });

      it('标识不带内容字样', () => {
        for (const seed of seeds.slice(0, 10)) {
          for (const v of build(seed).vaults) {
            expect(v.id).not.toMatch(/secret|coin/i);
          }
        }
      });
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

    it('initializes bribe pool and deck with action cards', () => {
      const s = createInitialState({
        playerCount: 4,
        playerIds: ['P1', 'P2', 'P3', 'P4'],
        nicknames: ['A', 'B', 'C', 'D'],
        rngSeed: 'seed',
      });
      // 贿赂池：3 DEAL + 3 fail = 6 张，初始都在 inPool
      expect(s.bribePool.length).toBe(6);
      expect(s.bribePool.every((b) => b.status === 'inPool')).toBe(true);
      expect(s.bribePool.filter((b) => b.kind === 'deal').length).toBe(3);
      expect(s.bribePool.filter((b) => b.kind === 'fail').length).toBe(3);
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

  describe('建局种子', () => {
    const setupOf = (data?: Record<string, unknown>) =>
      InceptionCityGame.setup({ ctx: { numPlayers: 5 } }, data);

    it('缺少 rngSeed 时抛错，不回落到默认值', () => {
      expect(() => setupOf()).toThrow(/rngSeed/);
      expect(() => setupOf({})).toThrow(/rngSeed/);
      expect(() => setupOf({ rngSeed: '' })).toThrow(/rngSeed/);
      expect(() => setupOf({ rngSeed: 42 })).toThrow(/rngSeed/);
    });

    it('同一个种子得到相同布局，不同种子得到不同布局', () => {
      const a = setupOf({ rngSeed: 'one' });
      expect(setupOf({ rngSeed: 'one' })).toEqual(a);
      expect(setupOf({ rngSeed: 'two' })).not.toEqual(a);
    });
  });
  describe('座位昵称与 Bot 座位', () => {
    const setupOf = (n: number, data: Record<string, unknown>) =>
      InceptionCityGame.setup({ ctx: { numPlayers: n } }, { rngSeed: 's', ...data });

    it('两者都不给时沿用默认昵称，玩家全是真人', () => {
      const g = setupOf(4, {});
      expect(g.players['0']!.nickname).toBe('Player 1');
      expect(Object.values(g.players).every((p) => p.type === 'human')).toBe(true);
    });

    it('按座位写入昵称', () => {
      const g = setupOf(4, { nicknames: ['甲', '乙', '丙', 'x'.repeat(50)] });
      expect(g.players['0']!.nickname).toBe('甲');
      expect(g.players['3']!.nickname).toBe('x'.repeat(50));
    });

    it('昵称数组长度不等于人数、项不是字符串或长度不在 1-50 时抛错', () => {
      expect(() => setupOf(4, { nicknames: ['a', 'b', 'c'] })).toThrow(/nicknames/);
      expect(() => setupOf(4, { nicknames: ['a', 'b', 'c', 'd', 'e'] })).toThrow(/nicknames/);
      expect(() => setupOf(4, { nicknames: 'abcd' })).toThrow(/nicknames/);
      expect(() => setupOf(4, { nicknames: ['a', 'b', 'c', 1] })).toThrow(/nicknames/);
      expect(() => setupOf(4, { nicknames: ['a', 'b', 'c', ''] })).toThrow(/nicknames/);
      expect(() => setupOf(4, { nicknames: ['a', 'b', 'c', 'x'.repeat(51)] })).toThrow(/nicknames/);
    });

    it('botSeats 对应的玩家 type 为 bot', () => {
      const g = setupOf(5, { botSeats: ['1', '4'] });
      expect(g.players['1']!.type).toBe('bot');
      expect(g.players['4']!.type).toBe('bot');
      expect(g.players['0']!.type).toBe('human');
    });

    it('botSeats 不是数组、含越界 / 非字符串 / 重复项时抛错', () => {
      expect(() => setupOf(4, { botSeats: '1' })).toThrow(/botSeats/);
      expect(() => setupOf(4, { botSeats: ['4'] })).toThrow(/botSeats/);
      expect(() => setupOf(4, { botSeats: ['-1'] })).toThrow(/botSeats/);
      expect(() => setupOf(4, { botSeats: [1] })).toThrow(/botSeats/);
      expect(() => setupOf(4, { botSeats: ['1', '1'] })).toThrow(/botSeats/);
      expect(() => setupOf(4, { botSeats: ['01'] })).toThrow(/botSeats/);
    });

    it('空的 botSeats 合法', () => {
      const g = setupOf(4, { botSeats: [] });
      expect(Object.values(g.players).every((p) => p.type === 'human')).toBe(true);
    });
  });
});
