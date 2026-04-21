import { describe, it, expect } from 'vitest';
import { migrateGameState, getSchemaVersion } from './migrations.js';

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
});
