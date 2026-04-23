// 成就系统 · 数据定义 + 计算触发点
// 对照：plans/design/02-game-rules-spec.md §2.13.5（成就示例 Phase 4 设计）
//
// 设计要点：
//   - 注册表模式（ACHIEVEMENTS 数组），便于后续新增成就而不改算法
//   - 每个成就 = id + 元信息 + predicate（纯函数，输入玩家统计 + 对局上下文）
//   - post-match 一次性结算：computeEarnedAchievements(stats, ctx) → Map<PlayerID, Set<AchievementId>>
//   - scope='individual'：每位玩家独立判定
//   - scope='faction'：阵营内全员共享（如"闪电战"盗梦者整队都拿）
//
// 触发点：
//   - 主触发：对局结束时（gameEndedAt）调用 computeEarnedAchievements
//   - 服务端落库后通过 WebSocket 推送 'achievements.earned' 事件给玩家
//   - 客户端展示在结算页 / 个人中心

import type { Faction } from '@icgame/shared';

export type AchievementId =
  | 'first_kill'
  | 'unlock_master'
  | 'rich_kingdom'
  | 'double_agent'
  | 'blitzkrieg'
  | 'unbreakable';

/**
 * 单玩家维度的成就计算输入。
 * 注意：originalFaction 与 faction 可能不同（背叛者起始 thief 终结 master）。
 */
export interface AchievementPlayerInput {
  readonly playerID: string;
  readonly faction: Faction; // 终结阵营
  readonly originalFaction: Faction; // 起始阵营
  readonly result: 'win' | 'lose' | 'abandoned';
  readonly kills: number;
  readonly unlockSuccessCount: number;
  readonly bribesReceived: number;
  readonly diedCount: number;
}

/**
 * 对局全局上下文（与某个玩家无关的信息）。
 */
export interface AchievementMatchContext {
  readonly totalRounds: number;
  readonly winnerFaction: Faction | null; // null = 平局/弃局
}

export interface AchievementDefinition {
  readonly id: AchievementId;
  readonly title: string;
  readonly description: string;
  readonly scope: 'individual' | 'faction';
  readonly predicate: (s: AchievementPlayerInput, ctx: AchievementMatchContext) => boolean;
}

/**
 * 成就注册表。新增成就只需在此追加一条。
 */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first_kill',
    title: '首杀',
    description: '本局至少击杀 1 名玩家',
    scope: 'individual',
    predicate: (s) => s.kills >= 1 && s.result !== 'abandoned',
  },
  {
    id: 'unlock_master',
    title: '解锁大师',
    description: '单局成功解封 5 次或以上',
    scope: 'individual',
    predicate: (s) => s.unlockSuccessCount >= 5 && s.result !== 'abandoned',
  },
  {
    id: 'rich_kingdom',
    title: '富可敌国',
    description: '单局收到 3 张贿赂且不是背叛者',
    scope: 'individual',
    predicate: (s) =>
      s.bribesReceived >= 3 &&
      s.originalFaction === 'thief' &&
      s.faction === 'thief' &&
      s.result !== 'abandoned',
  },
  {
    id: 'double_agent',
    title: '双面间谍',
    description: '作为背叛者（贿赂转阵营）成功让梦主阵营获胜',
    scope: 'individual',
    predicate: (s) => s.originalFaction === 'thief' && s.faction === 'master' && s.result === 'win',
  },
  {
    id: 'blitzkrieg',
    title: '闪电战',
    description: '盗梦者阵营在 10 回合内获胜（阵营成就）',
    scope: 'faction',
    predicate: (s, ctx) =>
      s.faction === 'thief' &&
      s.result === 'win' &&
      ctx.winnerFaction === 'thief' &&
      ctx.totalRounds <= 10,
  },
  {
    id: 'unbreakable',
    title: '不屈不挠',
    description: '单局被击杀 3 次或以上仍获胜',
    scope: 'individual',
    predicate: (s) => s.diedCount >= 3 && s.result === 'win',
  },
] as const;

/**
 * 一次性计算全场玩家的成就归属。
 * 返回 Map<playerID, Set<AchievementId>>。
 */
export function computeEarnedAchievements(
  stats: ReadonlyArray<AchievementPlayerInput>,
  ctx: AchievementMatchContext,
): Map<string, Set<AchievementId>> {
  const result = new Map<string, Set<AchievementId>>();
  for (const s of stats) result.set(s.playerID, new Set());

  for (const ach of ACHIEVEMENTS) {
    for (const s of stats) {
      if (ach.predicate(s, ctx)) {
        result.get(s.playerID)!.add(ach.id);
      }
    }
  }
  return result;
}

/**
 * 便捷工具：返回展开数组（含 title/description），便于结算页直接渲染。
 */
export function listEarnedWithMeta(
  stats: ReadonlyArray<AchievementPlayerInput>,
  ctx: AchievementMatchContext,
): Array<{ playerID: string; achievement: AchievementDefinition }> {
  const earned = computeEarnedAchievements(stats, ctx);
  const out: Array<{ playerID: string; achievement: AchievementDefinition }> = [];
  for (const [pid, ids] of earned) {
    for (const ach of ACHIEVEMENTS) {
      if (ids.has(ach.id)) out.push({ playerID: pid, achievement: ach });
    }
  }
  return out;
}

/**
 * 按成就 id 查询定义（用于客户端 i18n / 详情查询）。
 */
export function getAchievementDefinition(id: AchievementId): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
