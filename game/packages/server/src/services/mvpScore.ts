// MVP 评选算法 · W21 成就系统前置
// 对照：plans/design/02-game-rules-spec.md §2.13.5 MVP 评选
//
// 设计要点：
//   - 纯函数，便于单测与后续回放重算
//   - MVP 按阵营内得分最高选出（thief / master 各选各的）
//   - 弃局玩家（result='abandoned'）不参与 MVP 评选
//   - 平局场景保留多 MVP（所有并列最高分均标记 isMVP=true）
//
// 权重设计思路：
//   - 直接贡献（击杀 / 解锁 / 阻止解锁 / 救人 / 开金库）高权重
//   - 间接表现（伤害 / 贿赂 / 打牌量）中低权重
//   - 回合数少做微弱负权重（奖励效率，避免被迫消耗回合的玩家吃亏）
//   - 胜利阵营固定加成（非决定性，给输方也留 MVP 空间）

import type { Faction } from '@icgame/shared';

export interface MvpPlayerStats {
  readonly playerID: string;
  readonly faction: Faction;
  readonly result: 'win' | 'lose' | 'abandoned';
  readonly kills: number;
  readonly unlockSuccessCount: number;
  readonly unlockCanceledCount: number;
  readonly reviveCount: number;
  readonly vaultOpenedByYou: number;
  readonly bribesReceived: number;
  readonly damageDealt: number;
  readonly cardsPlayed: number;
  readonly turnsTaken: number;
}

export const MVP_WEIGHTS = {
  kills: 10,
  unlockSuccessCount: 5,
  unlockCanceledCount: 5,
  reviveCount: 8,
  vaultOpenedByYou: 6,
  damageDealt: 4,
  bribesReceived: 2,
  cardsPlayed: 0.5,
  turnsTakenPenalty: -0.3,
  winBonus: 15,
} as const;

/**
 * 计算单个玩家的 MVP 内部算分。
 * 弃局玩家仍给分（便于平台记录），但不会被 selectMVPs 选中。
 */
export function computeMvpScore(s: MvpPlayerStats): number {
  const w = MVP_WEIGHTS;
  const base =
    s.kills * w.kills +
    s.unlockSuccessCount * w.unlockSuccessCount +
    s.unlockCanceledCount * w.unlockCanceledCount +
    s.reviveCount * w.reviveCount +
    s.vaultOpenedByYou * w.vaultOpenedByYou;
  const secondary =
    s.damageDealt * w.damageDealt +
    s.bribesReceived * w.bribesReceived +
    s.cardsPlayed * w.cardsPlayed;
  const penalty = s.turnsTaken * w.turnsTakenPenalty;
  const bonus = s.result === 'win' ? w.winBonus : 0;
  return base + secondary + penalty + bonus;
}

/**
 * 选出每个阵营的 MVP（按算分并列时多 MVP）。
 * - abandoned 玩家不参选
 * - 若阵营内无有效玩家，则该阵营无 MVP
 * - 返回 playerID 集合供标注 isMVP
 */
export function selectMVPs(stats: ReadonlyArray<MvpPlayerStats>): Set<string> {
  const mvps = new Set<string>();
  const byFaction = new Map<Faction, MvpPlayerStats[]>();
  for (const s of stats) {
    if (s.result === 'abandoned') continue;
    const arr = byFaction.get(s.faction) ?? [];
    arr.push(s);
    byFaction.set(s.faction, arr);
  }
  for (const [, arr] of byFaction) {
    let maxScore = -Infinity;
    for (const s of arr) {
      const score = computeMvpScore(s);
      if (score > maxScore) maxScore = score;
    }
    for (const s of arr) {
      if (computeMvpScore(s) === maxScore) mvps.add(s.playerID);
    }
  }
  return mvps;
}

/**
 * 便捷工具：一次性返回带 isMVP / mvpScore 的结果。
 * 客户端结算页可直接渲染。
 */
export function computeMvpResults(
  stats: ReadonlyArray<MvpPlayerStats>,
): Array<MvpPlayerStats & { mvpScore: number; isMVP: boolean }> {
  const mvpSet = selectMVPs(stats);
  return stats.map((s) => ({
    ...s,
    mvpScore: computeMvpScore(s),
    isMVP: mvpSet.has(s.playerID),
  }));
}
