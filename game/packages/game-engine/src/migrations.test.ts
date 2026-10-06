import { describe, it, expect } from 'vitest';
import { migrateGameState, getSchemaVersion, CURRENT_SCHEMA_VERSION } from './migrations.js';
import { createInitialState } from './setup.js';
import { viewFor } from './engine/matchView.js';

describe('migrations', () => {
  it('should add missing fields to raw state', () => {
    const raw = { turnNumber: 0, phase: 'setup', players: {} };
    const state = migrateGameState(raw);
    expect(state.moveCounter).toBe(0);
    expect(state.schemaVersion).toBe(getSchemaVersion());
  });

  it('should preserve existing fields', () => {
    const raw = {
      turnNumber: 5,
      phase: 'playing',
      players: { p1: {} },
      moveCounter: 10,
      schemaVersion: 1,
    };
    const state = migrateGameState(raw);
    expect(state.turnNumber).toBe(5);
    expect(state.moveCounter).toBe(10);
  });

  // v1 → v2：添加 pendingLibra + mazeState
  it('v1 → v2 应补全 pendingLibra 与 mazeState 字段为 null（链式迁移后版本号为当前最新）', () => {
    const raw = {
      turnNumber: 3,
      phase: 'playing',
      players: { p1: {} },
      moveCounter: 7,
      schemaVersion: 1,
    };
    const state = migrateGameState(raw);
    expect(state.schemaVersion).toBe(getSchemaVersion());
    expect(state.pendingLibra).toBeNull();
    expect(state.mazeState).toBeNull();
  });

  // v2 → v3：添加 pendingPeekDecision + peekReveal（梦境窥视三段式）
  it('v2 → v3 应补全 pendingPeekDecision 与 peekReveal 字段为 null', () => {
    const raw = {
      turnNumber: 4,
      phase: 'playing',
      players: { p1: {} },
      moveCounter: 8,
      pendingLibra: null,
      mazeState: null,
      schemaVersion: 2,
    };
    const state = migrateGameState(raw);
    expect(state.schemaVersion).toBe(getSchemaVersion());
    expect(state.pendingPeekDecision).toBeNull();
    expect(state.peekReveal).toBeNull();
  });

  it('v0 全链路迁移：从空 state 到当前版本', () => {
    const raw = { turnNumber: 0, phase: 'setup', players: {} };
    const state = migrateGameState(raw);
    expect(state.schemaVersion).toBe(getSchemaVersion());
    expect(state.pendingLibra).toBeNull();
    expect(state.mazeState).toBeNull();
    expect(state.pendingPeekDecision).toBeNull();
    expect(state.peekReveal).toBeNull();
  });

  // v3 → v4 ~ v6 → v7：各版新增的字段补 null
  it.each([
    [3, 'pendingShootMove'],
    [4, 'pendingAriesChoice'],
    [5, 'pendingVirgoChoice'],
    [6, 'pendingShootResponse'],
  ])('v%i → v%i 应补全 %s 字段为 null', (from, field) => {
    const state = migrateGameState({ turnNumber: 1, players: {}, schemaVersion: from });
    expect(state.schemaVersion).toBe(getSchemaVersion());
    expect((state as unknown as Record<string, unknown>)[field]).toBeNull();
  });

  it('初始状态写入当前版本号', () => {
    const state = createInitialState({
      playerCount: 4,
      playerIds: ['0', '1', '2', '3'],
      nicknames: ['a', 'b', 'c', 'd'],
      rngSeed: 'v',
    });
    expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('高于当前版本的状态抛错，信息里带两个版本号', () => {
    const future = CURRENT_SCHEMA_VERSION + 1;
    expect(() => migrateGameState({ schemaVersion: future })).toThrow(
      new RegExp(`快照版本 ${future}.*当前版本 ${CURRENT_SCHEMA_VERSION}`),
    );
  });

  describe('入口校验', () => {
    it.each([
      ['null', null],
      ['数组', []],
      ['字符串', 'x'],
      ['数字', 3],
    ])('状态本身是 %s 时抛错', (_name, raw) => {
      expect(() => migrateGameState(raw as never)).toThrow(/普通对象/);
    });

    it.each([
      ['字符串 "3"', '3'],
      ['小数 7.5', 7.5],
      ['NaN', Number.NaN],
      ['负数 -1', -1],
      ['字符串 "abc"', 'abc'],
      ['null', null],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('schemaVersion 是 %s 时抛错，信息带上收到的值', (_name, version) => {
      expect(() => migrateGameState({ schemaVersion: version })).toThrow(/schemaVersion/);
    });

    it('错误信息带上收到的版本值', () => {
      expect(() => migrateGameState({ schemaVersion: '3' })).toThrow(/"3"/);
      expect(() => migrateGameState({ schemaVersion: 7.5 })).toThrow(/7\.5/);
    });

    it('缺省 schemaVersion 的对象仍能走完整条迁移链', () => {
      const state = migrateGameState({ turnNumber: 2, players: {} });
      expect(state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(state.pendingLibra).toBeNull();
      expect(state.removedFromGame).toEqual([]);
    });
  });

  it('补齐遗漏字段：旧版本状态迁移后含初始状态的全部顶层字段，且已有字段不被覆盖', () => {
    const fresh = createInitialState({
      playerCount: 4,
      playerIds: ['0', '1', '2', '3'],
      nicknames: ['a', 'b', 'c', 'd'],
      rngSeed: 'v',
    }) as unknown as Record<string, unknown>;
    const old: Record<string, unknown> = { ...fresh, schemaVersion: 7 };
    const backfilled = [
      'pendingUnlock',
      'pendingGraft',
      'pendingResonance',
      'pendingGravity',
      'shiftSnapshot',
      'pendingResponseWindow',
      'pendingSudgerRolls',
      'playedCardsThisTurn',
      'lastPlayedCardThisTurn',
      'lastShootRoll',
      'removedFromGame',
    ];
    for (const key of backfilled) delete old[key];
    old.turnNumber = 9;

    const migrated = migrateGameState(old) as unknown as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    for (const key of Object.keys(fresh)) expect(migrated, key).toHaveProperty(key);
    for (const key of backfilled) expect(migrated[key], key).toEqual(fresh[key]);
    expect(migrated.turnNumber).toBe(9);
  });

  it('已存在的补齐字段保持原值', () => {
    const state = migrateGameState({
      schemaVersion: 7,
      playedCardsThisTurn: ['x'],
      removedFromGame: ['y'],
      lastShootRoll: 4,
    });
    expect(state.playedCardsThisTurn).toEqual(['x']);
    expect(state.removedFromGame).toEqual(['y']);
    expect(state.lastShootRoll).toBe(4);
  });

  it('玩家对象缺少 successfulUnlocksThisTurn 时补 0，已有值保持', () => {
    const state = migrateGameState({
      schemaVersion: 7,
      players: {
        '0': { id: '0' },
        '1': { id: '1', successfulUnlocksThisTurn: 2 },
      },
    });
    expect(state.players['0']!.successfulUnlocksThisTurn).toBe(0);
    expect(state.players['1']!.successfulUnlocksThisTurn).toBe(2);
  });

  describe('v9 → v10 · 迷失层即死亡', () => {
    const player = (over: Record<string, unknown>) => ({
      id: 'x',
      isAlive: true,
      deathTurn: null,
      currentLayer: 1,
      ...over,
    });

    it('在迷失层却标着存活的玩家被规范为已死亡，deathTurn 取当时的回合数', () => {
      const state = migrateGameState({
        schemaVersion: 9,
        turnNumber: 12,
        players: { a: player({ id: 'a', currentLayer: 0 }) },
      });
      expect(state.players.a!.isAlive).toBe(false);
      expect(state.players.a!.deathTurn).toBe(12);
    });

    it('已死亡的玩家保持原来的死亡回合；不在迷失层的存活玩家不动', () => {
      const state = migrateGameState({
        schemaVersion: 9,
        turnNumber: 12,
        players: {
          dead: player({ id: 'dead', isAlive: false, deathTurn: 4, currentLayer: 0 }),
          live: player({ id: 'live', currentLayer: 3 }),
        },
      });
      expect(state.players.dead!.deathTurn).toBe(4);
      expect(state.players.live!.isAlive).toBe(true);
      expect(state.players.live!.deathTurn).toBeNull();
    });

    it('缺少 players 或回合数时不抛异常', () => {
      expect(() => migrateGameState({ schemaVersion: 9 })).not.toThrow();
      const state = migrateGameState({
        schemaVersion: 9,
        players: { a: player({ id: 'a', currentLayer: 0 }) },
      });
      expect(state.players.a!.isAlive).toBe(false);
      expect(state.players.a!.deathTurn).toBe(0);
    });
  });

  describe('v8 → v9 · 贿赂池', () => {
    // 旧状态：成功牌在前，标识带成败前缀；有两张已派出
    function legacyState(seed: unknown): Record<string, unknown> {
      const fresh = createInitialState({
        playerCount: 5,
        playerIds: ['0', '1', '2', '3', '4'],
        nicknames: ['a', 'b', 'c', 'd', 'e'],
        rngSeed: 'legacy-base',
      }) as unknown as Record<string, unknown>;
      const thieves = (fresh.playerOrder as string[]).filter((id) => id !== fresh.dreamMasterID);
      const old = [
        { id: 'bribe-deal-0', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'bribe-deal-1', status: 'dealt', heldBy: thieves[0], originalOwnerId: thieves[0] },
        { id: 'bribe-deal-2', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'bribe-fail-0', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'bribe-fail-1', status: 'dealt', heldBy: thieves[1], originalOwnerId: thieves[1] },
        { id: 'bribe-fail-2', status: 'inPool', heldBy: null, originalOwnerId: null },
      ];
      const raw: Record<string, unknown> = { ...fresh, schemaVersion: 8, bribePool: old };
      if (seed === undefined) delete raw.rngSeed;
      else raw.rngSeed = seed;
      return raw;
    }

    const kindsOf = (state: { bribePool: { kind: string }[] }): string => {
      return state.bribePool.map((b) => b.kind).join(',');
    };

    it('旧式标识被重新编号，池里不再有成败字样的标识', () => {
      const state = migrateGameState(legacyState('s1'));
      expect(state.bribePool.map((b) => b.id)).toEqual([
        'bribe-0',
        'bribe-1',
        'bribe-2',
        'bribe-3',
        'bribe-4',
        'bribe-5',
      ]);
    });

    it('迁移后任一盗梦者的视图里没有成败字样，也没有旧式标识', () => {
      const state = migrateGameState(legacyState('s2'));
      const thieves = state.playerOrder.filter((id) => id !== state.dreamMasterID);
      const strings = (v: unknown): string[] =>
        typeof v === 'string'
          ? [v]
          : typeof v === 'object' && v !== null
            ? Object.values(v).flatMap(strings)
            : [];
      for (const viewer of thieves) {
        const pool = viewFor(state, viewer, { gameOver: false }).bribePool;
        const leaves = strings(pool.filter((b) => b.heldBy !== viewer));
        for (const leaf of leaves) {
          expect(leaf).not.toMatch(/deal|fail/);
        }
        expect(JSON.stringify(pool)).not.toMatch(/bribe-(deal|fail)/);
      }
    });

    it('成功牌的下标在不同种子下不固定', () => {
      const layouts = new Set<string>();
      for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
        layouts.add(kindsOf(migrateGameState(legacyState(seed))));
      }
      expect(layouts.size).toBeGreaterThan(2);
    });

    it('已派出的牌的持有者、成败、状态原样保留', () => {
      const raw = legacyState('s3');
      const before = (raw.bribePool as Record<string, unknown>[])
        .map((b) =>
          JSON.stringify([
            b.status,
            b.heldBy,
            b.originalOwnerId,
            String(b.id).includes('deal') ? 'deal' : 'fail',
          ]),
        )
        .sort();
      const after = migrateGameState(raw)
        .bribePool.map((b) => JSON.stringify([b.status, b.heldBy, b.originalOwnerId, b.kind]))
        .sort();
      expect(after).toEqual(before);
    });

    it('迁移是纯函数且幂等：不改入参，重复迁移结果相同', () => {
      const raw = legacyState('s4');
      const snapshot = JSON.stringify(raw);
      const once = migrateGameState(raw);
      expect(JSON.stringify(raw)).toBe(snapshot);
      const twice = migrateGameState({ ...once, schemaVersion: 8 } as Record<string, unknown>);
      expect(twice.bribePool).toEqual(once.bribePool);
      expect(migrateGameState(legacyState('s4')).bribePool).toEqual(once.bribePool);
    });

    it('已经是新式标识的状态不动', () => {
      const fresh = createInitialState({
        playerCount: 5,
        playerIds: ['0', '1', '2', '3', '4'],
        nicknames: ['a', 'b', 'c', 'd', 'e'],
        rngSeed: 'new-style',
      });
      const migrated = migrateGameState({
        ...fresh,
        schemaVersion: 8,
      } as unknown as Record<string, unknown>);
      expect(migrated.bribePool).toEqual(fresh.bribePool);
    });

    it('rngSeed 缺失或不是字符串时不抛错', () => {
      expect(() => migrateGameState(legacyState(undefined))).not.toThrow();
      expect(() => migrateGameState(legacyState(42))).not.toThrow();
    });
  });
});
