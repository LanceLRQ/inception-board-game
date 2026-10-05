import { describe, it, expect } from 'vitest';
import { INVALID_MOVE as bgioInvalidMove } from 'boardgame.io/core';
import { INVALID_MOVE } from './invalidMove.js';
import { INVALID_MOVE as fromPackageEntry } from '../index.js';

describe('INVALID_MOVE', () => {
  it('equals the literal marker string', () => {
    expect(INVALID_MOVE).toBe('INVALID_MOVE');
  });

  it('matches the constant exported by boardgame.io', () => {
    expect(INVALID_MOVE).toBe(bgioInvalidMove);
  });

  it('is exported from the package entry', () => {
    expect(fromPackageEntry).toBe(INVALID_MOVE);
  });
});
