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
