import { describe, it, expect } from 'vitest';
import { migrateGameState, getSchemaVersion } from './migrations.js';

describe('migrations', () => {
  it('should add missing fields to raw state', () => {
    const raw = { turn: 0, phase: 'setup', players: {} };
    const state = migrateGameState(raw);
    expect(state.moveCounter).toBe(0);
    expect(state.schemaVersion).toBe(getSchemaVersion());
  });

  it('should preserve existing fields', () => {
    const raw = {
      turn: 5,
      phase: 'playing',
      players: { p1: {} },
      moveCounter: 10,
      schemaVersion: 1,
    };
    const state = migrateGameState(raw);
    expect(state.turn).toBe(5);
    expect(state.moveCounter).toBe(10);
  });
});
