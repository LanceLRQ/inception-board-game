// 全 Bot 对局：用对局运行器从建局打到终局，每一步之后检查不变量

import { describe, it, expect } from 'vitest';
import { runBotPlayout } from './playout.js';

const MAX_STEPS = 20000;

describe('runBotPlayout', () => {
  for (let numPlayers = 4; numPlayers <= 10; numPlayers++) {
    for (const seed of [`po-${numPlayers}-a`, `po-${numPlayers}-b`]) {
      it(`${numPlayers} 人 · 种子 ${seed}：打到终局，没有被拒的 move，没有不变量违规`, () => {
        const r = runBotPlayout({ numPlayers, seed, maxSteps: MAX_STEPS });
        expect({
          gameover: r.gameover !== undefined,
          stalledOn: r.stalledOn,
          rejected: r.rejected,
          invariantViolations: r.invariantViolations,
        }).toEqual({ gameover: true, stalledOn: null, rejected: null, invariantViolations: [] });
        expect(r.steps).toBeGreaterThan(0);
        expect(r.steps).toBeLessThan(MAX_STEPS);
      });
    }
  }

  it('同一种子两次结果完全相同', () => {
    const a = runBotPlayout({ numPlayers: 6, seed: 'repeat', maxSteps: MAX_STEPS });
    const b = runBotPlayout({ numPlayers: 6, seed: 'repeat', maxSteps: MAX_STEPS });
    expect(b).toEqual(a);
  });

  it('不同种子的对局不同', () => {
    const a = runBotPlayout({ numPlayers: 6, seed: 'one', maxSteps: MAX_STEPS });
    const b = runBotPlayout({ numPlayers: 6, seed: 'two', maxSteps: MAX_STEPS });
    expect(a.steps === b.steps && JSON.stringify(a.gameover) === JSON.stringify(b.gameover)).toBe(
      false,
    );
  });

  it('步数用尽时停在上限，不报终局', () => {
    const r = runBotPlayout({ numPlayers: 5, seed: 'cap', maxSteps: 10 });
    expect(r.steps).toBe(10);
    expect(r.gameover).toBeUndefined();
    expect(r.stalledOn).toBeNull();
    expect(r.rejected).toBeNull();
  });
});

describe('runBotPlayout · 打开出牌策略', () => {
  const totals: Record<string, number> = {};
  const games: { numPlayers: number; seed: string; r: ReturnType<typeof runBotPlayout> }[] = [];

  for (let numPlayers = 4; numPlayers <= 10; numPlayers++) {
    for (const seed of ['cp-a', 'cp-b', 'cp-c']) {
      it(`${numPlayers} 人 · 种子 ${seed}：打到终局，没有被拒的 move，不停住，不变量通过`, () => {
        const r = runBotPlayout({
          numPlayers,
          seed: `${seed}-${numPlayers}`,
          maxSteps: MAX_STEPS,
          cardPlay: true,
        });
        games.push({ numPlayers, seed, r });
        for (const [m, n] of Object.entries(r.cardMoves)) totals[m] = (totals[m] ?? 0) + n;
        expect({
          gameover: r.gameover !== undefined,
          stalledOn: r.stalledOn,
          rejected: r.rejected,
          invariantViolations: r.invariantViolations,
        }).toEqual({ gameover: true, stalledOn: null, rejected: null, invariantViolations: [] });
        expect(r.steps).toBeLessThan(MAX_STEPS);
      });
    }
  }

  it('Bot 确实打出了行动牌（解封、SHOOT 类之外至少再有一种）', () => {
    expect(games.length).toBe(21);
    const kinds = Object.keys(totals);
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(kinds).toContain('playUnlock');
    expect(kinds.length).toBeGreaterThanOrEqual(3);
  });

  it('关闭时没有任何出牌类 move', () => {
    const r = runBotPlayout({ numPlayers: 6, seed: 'cp-off', maxSteps: MAX_STEPS });
    expect(r.cardMoves).toEqual({});
  });

  it('同一种子两次结果完全相同', () => {
    const a = runBotPlayout({ numPlayers: 6, seed: 'cp-rep', maxSteps: MAX_STEPS, cardPlay: true });
    const b = runBotPlayout({ numPlayers: 6, seed: 'cp-rep', maxSteps: MAX_STEPS, cardPlay: true });
    expect(b).toEqual(a);
  });
});
