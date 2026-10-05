import { describe, it, expect } from 'vitest';
import { migrateGameState, getSchemaVersion, CURRENT_SCHEMA_VERSION } from './migrations.js';
import { createInitialState } from './setup.js';

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

  // v2 → v3：添加 pendingPeekDecision + peekReveal（W19-B F5/F8 梦境窥视三段式）
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
});
