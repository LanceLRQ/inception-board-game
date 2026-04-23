// 成就系统测试
// 对照：plans/design/02-game-rules-spec.md §2.13.5

import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  computeEarnedAchievements,
  listEarnedWithMeta,
  getAchievementDefinition,
  type AchievementPlayerInput,
  type AchievementMatchContext,
} from './achievements.js';

function mkInput(overrides: Partial<AchievementPlayerInput> = {}): AchievementPlayerInput {
  return {
    playerID: 'p1',
    faction: 'thief',
    originalFaction: 'thief',
    result: 'lose',
    kills: 0,
    unlockSuccessCount: 0,
    bribesReceived: 0,
    diedCount: 0,
    ...overrides,
  };
}

function mkCtx(overrides: Partial<AchievementMatchContext> = {}): AchievementMatchContext {
  return {
    totalRounds: 15,
    winnerFaction: null,
    ...overrides,
  };
}

describe('achievements · 注册表', () => {
  it('当前注册 6 个成就', () => {
    expect(ACHIEVEMENTS).toHaveLength(6);
  });

  it('成就 id 唯一', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个成就都有标题与描述', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it('getAchievementDefinition 可按 id 查到', () => {
    expect(getAchievementDefinition('first_kill')?.title).toBe('首杀');
    expect(getAchievementDefinition('blitzkrieg')?.scope).toBe('faction');
  });
});

describe('achievements · first_kill 首杀', () => {
  it('击杀 ≥1 → 拿', () => {
    const r = computeEarnedAchievements([mkInput({ kills: 1 })], mkCtx());
    expect(r.get('p1')!.has('first_kill')).toBe(true);
  });

  it('击杀 = 0 → 不拿', () => {
    const r = computeEarnedAchievements([mkInput({ kills: 0 })], mkCtx());
    expect(r.get('p1')!.has('first_kill')).toBe(false);
  });

  it('abandoned 即使有击杀也不拿', () => {
    const r = computeEarnedAchievements([mkInput({ kills: 5, result: 'abandoned' })], mkCtx());
    expect(r.get('p1')!.has('first_kill')).toBe(false);
  });
});

describe('achievements · unlock_master 解锁大师', () => {
  it('解封 ≥5 → 拿', () => {
    const r = computeEarnedAchievements([mkInput({ unlockSuccessCount: 5 })], mkCtx());
    expect(r.get('p1')!.has('unlock_master')).toBe(true);
  });

  it('解封 4 → 不拿', () => {
    const r = computeEarnedAchievements([mkInput({ unlockSuccessCount: 4 })], mkCtx());
    expect(r.get('p1')!.has('unlock_master')).toBe(false);
  });
});

describe('achievements · rich_kingdom 富可敌国', () => {
  it('收 3 贿赂 + 始终是盗梦者 → 拿', () => {
    const r = computeEarnedAchievements(
      [mkInput({ bribesReceived: 3, originalFaction: 'thief', faction: 'thief' })],
      mkCtx(),
    );
    expect(r.get('p1')!.has('rich_kingdom')).toBe(true);
  });

  it('收 3 贿赂但已成背叛者 → 不拿', () => {
    const r = computeEarnedAchievements(
      [mkInput({ bribesReceived: 3, originalFaction: 'thief', faction: 'master' })],
      mkCtx(),
    );
    expect(r.get('p1')!.has('rich_kingdom')).toBe(false);
  });

  it('收 2 贿赂 → 不拿', () => {
    const r = computeEarnedAchievements([mkInput({ bribesReceived: 2 })], mkCtx());
    expect(r.get('p1')!.has('rich_kingdom')).toBe(false);
  });
});

describe('achievements · double_agent 双面间谍', () => {
  it('原盗梦者转梦主 + 胜 → 拿', () => {
    const r = computeEarnedAchievements(
      [mkInput({ originalFaction: 'thief', faction: 'master', result: 'win' })],
      mkCtx({ winnerFaction: 'master' }),
    );
    expect(r.get('p1')!.has('double_agent')).toBe(true);
  });

  it('原盗梦者转梦主但败 → 不拿', () => {
    const r = computeEarnedAchievements(
      [mkInput({ originalFaction: 'thief', faction: 'master', result: 'lose' })],
      mkCtx({ winnerFaction: 'thief' }),
    );
    expect(r.get('p1')!.has('double_agent')).toBe(false);
  });

  it('未叛变的盗梦者胜 → 不拿', () => {
    const r = computeEarnedAchievements(
      [mkInput({ originalFaction: 'thief', faction: 'thief', result: 'win' })],
      mkCtx({ winnerFaction: 'thief' }),
    );
    expect(r.get('p1')!.has('double_agent')).toBe(false);
  });
});

describe('achievements · blitzkrieg 闪电战（阵营）', () => {
  it('盗梦者 ≤10 回合获胜 → 全队拿', () => {
    const stats: AchievementPlayerInput[] = [
      mkInput({ playerID: 'p1', faction: 'thief', result: 'win' }),
      mkInput({ playerID: 'p2', faction: 'thief', result: 'win' }),
      mkInput({ playerID: 'pM', faction: 'master', result: 'lose' }),
    ];
    const r = computeEarnedAchievements(stats, mkCtx({ totalRounds: 8, winnerFaction: 'thief' }));
    expect(r.get('p1')!.has('blitzkrieg')).toBe(true);
    expect(r.get('p2')!.has('blitzkrieg')).toBe(true);
    expect(r.get('pM')!.has('blitzkrieg')).toBe(false);
  });

  it('11 回合获胜 → 不拿', () => {
    const r = computeEarnedAchievements(
      [mkInput({ faction: 'thief', result: 'win' })],
      mkCtx({ totalRounds: 11, winnerFaction: 'thief' }),
    );
    expect(r.get('p1')!.has('blitzkrieg')).toBe(false);
  });

  it('梦主 10 回合内获胜 → 盗梦者不拿（阵营条件）', () => {
    const r = computeEarnedAchievements(
      [mkInput({ faction: 'thief', result: 'lose' })],
      mkCtx({ totalRounds: 8, winnerFaction: 'master' }),
    );
    expect(r.get('p1')!.has('blitzkrieg')).toBe(false);
  });
});

describe('achievements · unbreakable 不屈不挠', () => {
  it('被杀 ≥3 + 胜 → 拿', () => {
    const r = computeEarnedAchievements([mkInput({ diedCount: 3, result: 'win' })], mkCtx());
    expect(r.get('p1')!.has('unbreakable')).toBe(true);
  });

  it('被杀 ≥3 但败 → 不拿', () => {
    const r = computeEarnedAchievements([mkInput({ diedCount: 5, result: 'lose' })], mkCtx());
    expect(r.get('p1')!.has('unbreakable')).toBe(false);
  });

  it('被杀 2 + 胜 → 不拿', () => {
    const r = computeEarnedAchievements([mkInput({ diedCount: 2, result: 'win' })], mkCtx());
    expect(r.get('p1')!.has('unbreakable')).toBe(false);
  });
});

describe('achievements · listEarnedWithMeta', () => {
  it('返回扁平化数组带元信息', () => {
    const stats: AchievementPlayerInput[] = [
      mkInput({ playerID: 'p1', kills: 1, unlockSuccessCount: 5 }),
    ];
    const list = listEarnedWithMeta(stats, mkCtx());
    expect(list).toHaveLength(2); // first_kill + unlock_master
    expect(list[0]!.achievement.title).toBe('首杀');
    expect(list[1]!.achievement.title).toBe('解锁大师');
  });

  it('无成就时返回空数组', () => {
    const list = listEarnedWithMeta([mkInput()], mkCtx());
    expect(list).toEqual([]);
  });

  it('多玩家多成就场景', () => {
    const stats: AchievementPlayerInput[] = [
      mkInput({ playerID: 'p1', kills: 1, faction: 'thief', result: 'win' }),
      mkInput({ playerID: 'p2', diedCount: 3, faction: 'thief', result: 'win' }),
    ];
    const list = listEarnedWithMeta(stats, mkCtx({ totalRounds: 7, winnerFaction: 'thief' }));
    // p1: first_kill + blitzkrieg
    // p2: blitzkrieg + unbreakable
    expect(list.filter((x) => x.playerID === 'p1').length).toBe(2);
    expect(list.filter((x) => x.playerID === 'p2').length).toBe(2);
  });
});

describe('achievements · 边界 · 空输入', () => {
  it('空 stats → 空 Map', () => {
    const r = computeEarnedAchievements([], mkCtx());
    expect(r.size).toBe(0);
  });
});
