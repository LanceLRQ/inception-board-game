import { describe, it, expect } from 'vitest';
import {
  advanceStep,
  buildMatchSetupInput,
  mulberry32FromSeed,
  runBotMatch,
  runBotBatch,
  summarize,
  type MatchRunResult,
} from './matchRunner.js';
import { createTestState } from '@icgame/game-engine/testing/fixtures';
import { scenarioStartOfGame3p } from '@icgame/game-engine/testing/scenarios';
import { checkInvariants } from '@icgame/game-engine/invariants';

describe('mulberry32FromSeed', () => {
  it('returns deterministic sequence for the same seed', () => {
    const a = mulberry32FromSeed('seed-1');
    const b = mulberry32FromSeed('seed-1');
    const aSeq = [a(), a(), a()];
    const bSeq = [b(), b(), b()];
    expect(aSeq).toEqual(bSeq);
  });

  it('different seeds yield different sequences', () => {
    const a = mulberry32FromSeed('seed-1');
    const b = mulberry32FromSeed('seed-2');
    expect(a()).not.toBe(b());
  });

  it('values are in [0, 1)', () => {
    const r = mulberry32FromSeed('s');
    for (let i = 0; i < 50; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('buildMatchSetupInput', () => {
  it('creates ordered playerIds p0..pN', () => {
    const input = buildMatchSetupInput({ matchId: 'm', seed: 's', playerCount: 4 });
    expect(input.playerIds).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(input.nicknames).toEqual(['Bot-0', 'Bot-1', 'Bot-2', 'Bot-3']);
    expect(input.rngSeed).toBe('s');
  });
});

describe('advanceStep · phase transitions', () => {
  it('turnStart → draw', () => {
    const s = { ...scenarioStartOfGame3p(), turnPhase: 'turnStart' as const };
    const next = advanceStep(s, () => 0.5);
    expect(next.turnPhase).toBe('draw');
  });

  it('draw → action (and adds 2 cards to current player)', () => {
    const s = { ...scenarioStartOfGame3p(), turnPhase: 'draw' as const };
    const before = s.players[s.currentPlayerID]!.hand.length;
    const next = advanceStep(s, () => 0.5);
    expect(next.turnPhase).toBe('action');
    expect(next.players[s.currentPlayerID]!.hand.length).toBe(before + 2);
  });

  it('action → discard', () => {
    const s = { ...scenarioStartOfGame3p(), turnPhase: 'action' as const };
    const next = advanceStep(s, () => 0.5);
    expect(next.turnPhase).toBe('discard');
  });

  it('discard → turnEnd (enforces HAND_LIMIT)', () => {
    const s = scenarioStartOfGame3p();
    const tooMany = Array.from({ length: 8 }, (_, i) => `c${i}` as `draw_${number}`);
    const withTooMany = {
      ...s,
      turnPhase: 'discard' as const,
      players: {
        ...s.players,
        [s.currentPlayerID]: { ...s.players[s.currentPlayerID]!, hand: tooMany },
      },
    };
    const next = advanceStep(withTooMany, () => 0.5);
    expect(next.turnPhase).toBe('turnEnd');
    expect(next.players[s.currentPlayerID]!.hand.length).toBeLessThanOrEqual(5);
  });

  it('turnEnd → next alive player + turnStart', () => {
    const s = { ...scenarioStartOfGame3p(), turnPhase: 'turnEnd' as const };
    const next = advanceStep(s, () => 0.5);
    expect(next.turnPhase).toBe('turnStart');
    expect(next.currentPlayerID).not.toBe(s.currentPlayerID);
  });
});

describe('runBotMatch · happy path', () => {
  it('completes without invariant violations for default 5-player setup', () => {
    const r = runBotMatch({ seed: 'test-1', maxTurns: 5 });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.turnsSimulated).toBeGreaterThan(0);
  });

  it('is deterministic with the same seed', () => {
    const a = runBotMatch({ seed: 'same', maxTurns: 3, matchId: 'm1' });
    const b = runBotMatch({ seed: 'same', maxTurns: 3, matchId: 'm1' });
    expect(a.ok).toBe(b.ok);
    expect(a.turnsSimulated).toBe(b.turnsSimulated);
  });

  it('respects maxTurns (≤4 phase steps per turn × maxTurns upper bound)', () => {
    const r = runBotMatch({ seed: 'cap', maxTurns: 2 });
    expect(r.turnsSimulated).toBeLessThanOrEqual(2);
  });

  it('works for 4-player setup (min)', () => {
    const r = runBotMatch({ seed: 'min', playerCount: 4, maxTurns: 3 });
    expect(r.ok).toBe(true);
  });

  it('works for 10-player setup (max)', () => {
    const r = runBotMatch({ seed: 'max', playerCount: 10, maxTurns: 3 });
    expect(r.ok).toBe(true);
  });

  it('reports error on bad setup input (unsupported player count)', () => {
    const r = runBotMatch({ seed: 'bad', playerCount: 2, maxTurns: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe('runBotMatch · invariants always clean', () => {
  it('after each step invariants remain clean for 5 different seeds', () => {
    for (let i = 0; i < 5; i++) {
      const r = runBotMatch({ seed: `inv-${i}`, maxTurns: 10 });
      expect(r.ok).toBe(true);
      expect(r.violations).toEqual([]);
    }
  });
});

describe('runBotBatch', () => {
  it('runs N matches and aggregates report', () => {
    const report = runBotBatch({ count: 5, baseSeed: 'batch', maxTurns: 3 });
    expect(report.totalMatches).toBe(5);
    expect(report.passed).toBe(5);
    expect(report.failed).toBe(0);
    expect(report.passRate).toBe(1);
    expect(report.avgTurnsPerMatch).toBeGreaterThan(0);
  });

  it('calls onProgress for every completed match', () => {
    const progress: Array<{ done: number; total: number }> = [];
    runBotBatch({
      count: 3,
      baseSeed: 'prog',
      maxTurns: 2,
      onProgress: (done, total) => progress.push({ done, total }),
    });
    expect(progress.length).toBe(3);
    expect(progress[2]).toEqual({ done: 3, total: 3 });
  });
});

describe('summarize', () => {
  const okResult: MatchRunResult = {
    matchId: 'ok',
    ok: true,
    turnsSimulated: 10,
    violations: [],
  };
  const failResult: MatchRunResult = {
    matchId: 'fail',
    ok: false,
    turnsSimulated: 3,
    violations: [
      { rule: 'master_count', message: 'err' },
      { rule: 'hand_limit', message: 'err' },
    ],
  };

  it('computes pass/fail counts correctly', () => {
    const r = summarize([okResult, failResult, okResult]);
    expect(r.passed).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.totalMatches).toBe(3);
    expect(r.passRate).toBeCloseTo(2 / 3);
  });

  it('ranks top violations by frequency', () => {
    const many: MatchRunResult = {
      matchId: 'many',
      ok: false,
      turnsSimulated: 1,
      violations: [
        { rule: 'master_count', message: 'x' },
        { rule: 'master_count', message: 'x' },
      ],
    };
    const r = summarize([failResult, many]);
    expect(r.topViolations[0]?.rule).toBe('master_count');
    expect(r.topViolations[0]?.count).toBe(3);
  });

  it('handles empty input', () => {
    const r = summarize([]);
    expect(r.totalMatches).toBe(0);
    expect(r.passRate).toBe(0);
    expect(r.avgTurnsPerMatch).toBe(0);
  });
});

describe('集成：runBotMatch → checkInvariants 同步', () => {
  it('simulated state 在回合结束时依然通过 invariants', () => {
    // 手动从 createTestState 跑几步 advanceStep，验证与 runBotMatch 的一致性
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'turnStart',
      currentPlayerID: 'p1',
      dreamMasterID: 'pM',
    });
    let s = base;
    const rand = mulberry32FromSeed('int-test');
    for (let i = 0; i < 12; i++) {
      s = advanceStep(s, rand);
      const v = checkInvariants(s);
      expect(v).toEqual([]);
    }
  });
});
