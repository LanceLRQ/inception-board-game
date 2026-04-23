// MVP 评选算法测试
// 对照：plans/design/02-game-rules-spec.md §2.13.5

import { describe, it, expect } from 'vitest';
import {
  computeMvpScore,
  selectMVPs,
  computeMvpResults,
  MVP_WEIGHTS,
  type MvpPlayerStats,
} from './mvpScore.js';

function mkStat(overrides: Partial<MvpPlayerStats> = {}): MvpPlayerStats {
  return {
    playerID: 'p1',
    faction: 'thief',
    result: 'lose',
    kills: 0,
    unlockSuccessCount: 0,
    unlockCanceledCount: 0,
    reviveCount: 0,
    vaultOpenedByYou: 0,
    bribesReceived: 0,
    damageDealt: 0,
    cardsPlayed: 0,
    turnsTaken: 0,
    ...overrides,
  };
}

describe('mvpScore · computeMvpScore', () => {
  it('全 0 统计 → 0 分', () => {
    expect(computeMvpScore(mkStat())).toBe(0);
  });

  it('1 次击杀 → 10 分（kills 权重）', () => {
    expect(computeMvpScore(mkStat({ kills: 1 }))).toBe(MVP_WEIGHTS.kills);
  });

  it('胜利阵营加 15 分 bonus', () => {
    expect(computeMvpScore(mkStat({ result: 'win' }))).toBe(MVP_WEIGHTS.winBonus);
  });

  it('综合统计正确累加', () => {
    const s = mkStat({
      kills: 2,
      unlockSuccessCount: 3,
      reviveCount: 1,
      vaultOpenedByYou: 1,
      damageDealt: 2,
      cardsPlayed: 10,
      turnsTaken: 5,
      result: 'win',
    });
    // 2*10 + 3*5 + 1*8 + 1*6 + 2*4 + 0 + 10*0.5 + 5*(-0.3) + 15
    // = 20 + 15 + 8 + 6 + 8 + 0 + 5 + -1.5 + 15 = 75.5
    expect(computeMvpScore(s)).toBeCloseTo(75.5, 5);
  });

  it('回合数惩罚：长回合扣分', () => {
    const fast = mkStat({ kills: 1, turnsTaken: 3 });
    const slow = mkStat({ kills: 1, turnsTaken: 10 });
    expect(computeMvpScore(fast)).toBeGreaterThan(computeMvpScore(slow));
  });

  it('abandoned 也计算分数（但不参与 MVP 选拔）', () => {
    const s = mkStat({ kills: 5, result: 'abandoned' });
    expect(computeMvpScore(s)).toBe(50); // 5*10，无 winBonus
  });
});

describe('mvpScore · selectMVPs', () => {
  it('阵营内唯一最高分玩家被选中', () => {
    const stats: MvpPlayerStats[] = [
      mkStat({ playerID: 'p1', faction: 'thief', kills: 3 }),
      mkStat({ playerID: 'p2', faction: 'thief', kills: 1 }),
      mkStat({ playerID: 'pM', faction: 'master', unlockCanceledCount: 4 }),
    ];
    const mvps = selectMVPs(stats);
    expect(mvps.has('p1')).toBe(true);
    expect(mvps.has('p2')).toBe(false);
    expect(mvps.has('pM')).toBe(true); // master 阵营独苗自动 MVP
  });

  it('两阵营各出一个 MVP', () => {
    const stats: MvpPlayerStats[] = [
      mkStat({ playerID: 'p1', faction: 'thief', kills: 2, result: 'win' }),
      mkStat({ playerID: 'p2', faction: 'thief', kills: 1 }),
      mkStat({ playerID: 'pM', faction: 'master', kills: 5 }),
    ];
    const mvps = selectMVPs(stats);
    expect(mvps).toEqual(new Set(['p1', 'pM']));
  });

  it('并列最高分时多 MVP', () => {
    const stats: MvpPlayerStats[] = [
      mkStat({ playerID: 'p1', faction: 'thief', kills: 2 }),
      mkStat({ playerID: 'p2', faction: 'thief', kills: 2 }),
      mkStat({ playerID: 'p3', faction: 'thief', kills: 1 }),
    ];
    const mvps = selectMVPs(stats);
    expect(mvps).toEqual(new Set(['p1', 'p2']));
  });

  it('abandoned 玩家不参与评选（即使分数最高）', () => {
    const stats: MvpPlayerStats[] = [
      mkStat({ playerID: 'pX', faction: 'thief', kills: 99, result: 'abandoned' }),
      mkStat({ playerID: 'p1', faction: 'thief', kills: 1 }),
    ];
    const mvps = selectMVPs(stats);
    expect(mvps.has('pX')).toBe(false);
    expect(mvps.has('p1')).toBe(true);
  });

  it('阵营全员 abandoned → 该阵营无 MVP', () => {
    const stats: MvpPlayerStats[] = [
      mkStat({ playerID: 'p1', faction: 'thief', result: 'abandoned' }),
      mkStat({ playerID: 'p2', faction: 'thief', result: 'abandoned' }),
      mkStat({ playerID: 'pM', faction: 'master', kills: 1 }),
    ];
    const mvps = selectMVPs(stats);
    expect(mvps.size).toBe(1);
    expect(mvps.has('pM')).toBe(true);
  });

  it('空数组 → 空集合', () => {
    expect(selectMVPs([])).toEqual(new Set());
  });

  it('阵营胜负 bonus 可扭转 MVP（胜者即便绝对值低也可赢）', () => {
    // p1 输但打得多，p2 胜利 bonus 帮忙
    // p1: kills=2 → 20；p2: kills=1 + winBonus=15 → 10+15=25
    const stats: MvpPlayerStats[] = [
      mkStat({ playerID: 'p1', faction: 'thief', kills: 2, result: 'lose' }),
      mkStat({ playerID: 'p2', faction: 'thief', kills: 1, result: 'win' }),
    ];
    const mvps = selectMVPs(stats);
    expect(mvps.has('p2')).toBe(true);
    expect(mvps.has('p1')).toBe(false);
  });
});

describe('mvpScore · computeMvpResults', () => {
  it('返回每个玩家的分数 + isMVP 标记', () => {
    const stats: MvpPlayerStats[] = [
      mkStat({ playerID: 'p1', faction: 'thief', kills: 2 }),
      mkStat({ playerID: 'p2', faction: 'thief', kills: 0 }),
    ];
    const results = computeMvpResults(stats);
    expect(results).toHaveLength(2);
    expect(results[0]!.playerID).toBe('p1');
    expect(results[0]!.mvpScore).toBe(20);
    expect(results[0]!.isMVP).toBe(true);
    expect(results[1]!.mvpScore).toBe(0);
    expect(results[1]!.isMVP).toBe(false);
  });

  it('保留输入顺序', () => {
    const stats: MvpPlayerStats[] = [
      mkStat({ playerID: 'pC', faction: 'thief' }),
      mkStat({ playerID: 'pA', faction: 'thief' }),
      mkStat({ playerID: 'pB', faction: 'thief' }),
    ];
    const results = computeMvpResults(stats);
    expect(results.map((r) => r.playerID)).toEqual(['pC', 'pA', 'pB']);
  });
});
