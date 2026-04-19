import { describe, it, expect } from 'vitest';
import { parseStoredProgress } from './useTutorialStore.js';

describe('parseStoredProgress', () => {
  it('returns null for empty/missing input', () => {
    expect(parseStoredProgress(null)).toBeNull();
    expect(parseStoredProgress('')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseStoredProgress('not json')).toBeNull();
  });

  it('returns null when required fields missing', () => {
    expect(parseStoredProgress('{}')).toBeNull();
    expect(parseStoredProgress(JSON.stringify({ scenarioId: 'x' }))).toBeNull();
  });

  it('accepts valid progress shape', () => {
    const p = {
      scenarioId: 'basics',
      currentStepIndex: 2,
      completedStepIds: ['s1', 's2'],
      completedAt: null,
      skippedCount: 0,
      startedAt: 1000,
    };
    expect(parseStoredProgress(JSON.stringify(p))).toEqual(p);
  });
});
