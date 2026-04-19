import { describe, it, expect } from 'vitest';
import {
  advance,
  computeProgressPercent,
  getCurrentStep,
  initialProgress,
  isCompleted,
  jumpToStepId,
  validateScenario,
} from './engine.js';
import { BASICS_TUTORIAL } from './scenarios/basics.js';
import type { TutorialScenario } from './types.js';

const TINY_SCENARIO: TutorialScenario = {
  id: 'tiny',
  version: '1.0.0',
  title: 'Tiny',
  description: '',
  estimatedMinutes: 1,
  steps: [
    { id: 's1', kind: 'info', body: 'step 1', cta: 'next' },
    { id: 's2', kind: 'info', body: 'step 2', cta: 'next' },
    { id: 's3', kind: 'info', body: 'step 3', cta: 'next' },
  ],
};

describe('initialProgress', () => {
  it('starts at step 0 with empty completedStepIds', () => {
    const p = initialProgress(TINY_SCENARIO, () => 1000);
    expect(p.currentStepIndex).toBe(0);
    expect(p.completedStepIds).toEqual([]);
    expect(p.completedAt).toBeNull();
    expect(p.skippedCount).toBe(0);
    expect(p.startedAt).toBe(1000);
    expect(p.scenarioId).toBe('tiny');
  });
});

describe('getCurrentStep', () => {
  it('returns the step at currentStepIndex', () => {
    const p = initialProgress(TINY_SCENARIO);
    expect(getCurrentStep(TINY_SCENARIO, p)?.id).toBe('s1');
  });

  it('returns null past the last step', () => {
    const p = { ...initialProgress(TINY_SCENARIO), currentStepIndex: 99 };
    expect(getCurrentStep(TINY_SCENARIO, p)).toBeNull();
  });

  it('returns null when scenarioId mismatch', () => {
    const p = { ...initialProgress(TINY_SCENARIO), scenarioId: 'other' };
    expect(getCurrentStep(TINY_SCENARIO, p)).toBeNull();
  });
});

describe('advance · next', () => {
  it('moves currentStepIndex forward', () => {
    const p0 = initialProgress(TINY_SCENARIO);
    const p1 = advance(TINY_SCENARIO, p0, { type: 'next' });
    expect(p1.currentStepIndex).toBe(1);
    expect(p1.completedStepIds).toEqual(['s1']);
  });

  it('sets completedAt when passing last step', () => {
    let p = initialProgress(TINY_SCENARIO);
    p = advance(TINY_SCENARIO, p, { type: 'next' }, () => 1);
    p = advance(TINY_SCENARIO, p, { type: 'next' }, () => 2);
    p = advance(TINY_SCENARIO, p, { type: 'next' }, () => 3);
    expect(p.completedAt).toBe(3);
    expect(p.currentStepIndex).toBe(3);
    expect(p.completedStepIds).toEqual(['s1', 's2', 's3']);
  });

  it('does not move when already completed', () => {
    const p = {
      ...initialProgress(TINY_SCENARIO),
      currentStepIndex: 3,
      completedAt: 100,
    };
    const after = advance(TINY_SCENARIO, p, { type: 'next' });
    expect(after).toBe(p);
  });

  it('does not duplicate completedStepIds if step already recorded', () => {
    const p = {
      ...initialProgress(TINY_SCENARIO),
      completedStepIds: ['s1'],
    };
    const after = advance(TINY_SCENARIO, p, { type: 'next' });
    expect(after.completedStepIds.filter((id) => id === 's1').length).toBe(1);
  });
});

describe('advance · skip', () => {
  it('jumps to end and increments skippedCount', () => {
    const p = initialProgress(TINY_SCENARIO);
    const after = advance(TINY_SCENARIO, p, { type: 'skip' }, () => 999);
    expect(after.currentStepIndex).toBe(TINY_SCENARIO.steps.length);
    expect(after.completedAt).toBe(999);
    expect(after.skippedCount).toBe(1);
  });
});

describe('advance · choose', () => {
  it('advances one step (MVP: no branching)', () => {
    const p = initialProgress(TINY_SCENARIO);
    const after = advance(TINY_SCENARIO, p, { type: 'choose', choiceId: 'x' });
    expect(after.currentStepIndex).toBe(1);
  });
});

describe('advance · restart', () => {
  it('resets currentStepIndex + completedStepIds + completedAt', () => {
    const p = {
      ...initialProgress(TINY_SCENARIO),
      currentStepIndex: 3,
      completedStepIds: ['s1', 's2', 's3'],
      completedAt: 100,
    };
    const after = advance(TINY_SCENARIO, p, { type: 'restart' });
    expect(after.currentStepIndex).toBe(0);
    expect(after.completedStepIds).toEqual([]);
    expect(after.completedAt).toBeNull();
  });

  it('preserves startedAt', () => {
    const p = { ...initialProgress(TINY_SCENARIO), startedAt: 42, completedAt: 100 };
    const after = advance(TINY_SCENARIO, p, { type: 'restart' });
    expect(after.startedAt).toBe(42);
  });
});

describe('isCompleted', () => {
  it('returns false for fresh progress', () => {
    expect(isCompleted(initialProgress(TINY_SCENARIO))).toBe(false);
  });

  it('returns true when completedAt is set', () => {
    const p = { ...initialProgress(TINY_SCENARIO), completedAt: 123 };
    expect(isCompleted(p)).toBe(true);
  });
});

describe('computeProgressPercent', () => {
  it('returns 0 at start', () => {
    expect(computeProgressPercent(TINY_SCENARIO, initialProgress(TINY_SCENARIO))).toBe(0);
  });

  it('returns correct percentage mid-way', () => {
    const p = { ...initialProgress(TINY_SCENARIO), currentStepIndex: 1 };
    expect(computeProgressPercent(TINY_SCENARIO, p)).toBe(33);
  });

  it('caps at 100 past last step', () => {
    const p = { ...initialProgress(TINY_SCENARIO), currentStepIndex: 10 };
    expect(computeProgressPercent(TINY_SCENARIO, p)).toBe(100);
  });
});

describe('jumpToStepId', () => {
  it('allows jump back to earlier step id', () => {
    const p = { ...initialProgress(TINY_SCENARIO), currentStepIndex: 2 };
    const after = jumpToStepId(TINY_SCENARIO, p, 's1');
    expect(after.currentStepIndex).toBe(0);
  });

  it('does not allow jump forward beyond currentStepIndex', () => {
    const p = { ...initialProgress(TINY_SCENARIO), currentStepIndex: 0 };
    const after = jumpToStepId(TINY_SCENARIO, p, 's3');
    expect(after.currentStepIndex).toBe(0);
  });

  it('returns same progress when step id not found', () => {
    const p = initialProgress(TINY_SCENARIO);
    expect(jumpToStepId(TINY_SCENARIO, p, 'nonexistent')).toBe(p);
  });
});

describe('validateScenario', () => {
  it('passes on valid BASICS_TUTORIAL', () => {
    expect(validateScenario(BASICS_TUTORIAL)).toEqual([]);
  });

  it('catches empty steps', () => {
    const issues = validateScenario({ ...BASICS_TUTORIAL, steps: [] });
    expect(issues.some((i) => i.includes('empty'))).toBe(true);
  });

  it('catches duplicate step ids', () => {
    const bad: TutorialScenario = {
      ...TINY_SCENARIO,
      steps: [
        { id: 'x', kind: 'info', body: 'a' },
        { id: 'x', kind: 'info', body: 'b' },
      ],
    };
    const issues = validateScenario(bad);
    expect(issues.some((i) => i.includes('duplicate'))).toBe(true);
  });

  it('catches choice without choices', () => {
    const bad: TutorialScenario = {
      ...TINY_SCENARIO,
      steps: [{ id: 'c1', kind: 'choice', body: 'pick' }],
    };
    const issues = validateScenario(bad);
    expect(issues.some((i) => i.includes('has no choices'))).toBe(true);
  });

  it('catches step with empty body', () => {
    const bad: TutorialScenario = {
      ...TINY_SCENARIO,
      steps: [{ id: 'x', kind: 'info', body: '' }],
    };
    const issues = validateScenario(bad);
    expect(issues.some((i) => i.includes('empty body'))).toBe(true);
  });
});

describe('BASICS_TUTORIAL · 内容健康', () => {
  it('is 7 minutes estimated', () => {
    expect(BASICS_TUTORIAL.estimatedMinutes).toBeGreaterThan(0);
    expect(BASICS_TUTORIAL.estimatedMinutes).toBeLessThanOrEqual(10);
  });

  it('has at least 7 steps', () => {
    expect(BASICS_TUTORIAL.steps.length).toBeGreaterThanOrEqual(7);
  });

  it('ends with a choice step', () => {
    const last = BASICS_TUTORIAL.steps[BASICS_TUTORIAL.steps.length - 1];
    expect(last?.kind).toBe('choice');
  });
});
