// Bot 夜间回归 runner
// 对照：plans/design/10-roadmap-risk.md W9 / plans/tasks.md Bot 夜间 100 局回归
//
// 设计：
//   - MVP 阶段 engine 的完整 Move 尚未全量就位，这里提供一个**简化回合 loop**：
//     turnStart → draw → action → discard → turnEnd → 切下一玩家
//   - 每一步后调用 checkInvariants；有违规即记 failure（不 throw，继续下一局以统计）
//   - 种子化 PRNG 保证可复现
//
// 该框架未来可替换为"真正的 engine Move 派发"，只需把 advanceStep 换成真 move handler。

import { createInitialState, type SetupState } from '@icgame/game-engine/setup';
import { checkInvariants, type InvariantViolation } from '@icgame/game-engine/invariants';
import { HAND_LIMIT } from '@icgame/game-engine/config';
import type { CardID } from '@icgame/shared';

export interface MatchRunResult {
  readonly matchId: string;
  readonly ok: boolean;
  readonly turnsSimulated: number;
  readonly violations: readonly InvariantViolation[];
  readonly error?: string;
}

export interface BatchReport {
  readonly totalMatches: number;
  readonly passed: number;
  readonly failed: number;
  readonly passRate: number;
  readonly totalTurns: number;
  readonly avgTurnsPerMatch: number;
  readonly topViolations: readonly { readonly rule: string; readonly count: number }[];
  readonly failedMatches: readonly MatchRunResult[];
}

export interface RunMatchOptions {
  readonly matchId?: string;
  readonly seed: string;
  readonly playerCount?: number;
  readonly maxTurns?: number;
  /** 可注入随机源，方便测试稳定性 */
  readonly rand?: () => number;
}

/** 纯函数：seed 字符串 → 简单 32 位 PRNG（mulberry32） */
export function mulberry32FromSeed(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 纯函数：根据 playerCount 构建 setup 输入 */
export function buildMatchSetupInput(opts: {
  readonly matchId: string;
  readonly seed: string;
  readonly playerCount: number;
}): Parameters<typeof createInitialState>[0] {
  const playerIds: string[] = [];
  const nicknames: string[] = [];
  for (let i = 0; i < opts.playerCount; i++) {
    playerIds.push(`p${i}`);
    nicknames.push(`Bot-${i}`);
  }
  return {
    playerCount: opts.playerCount,
    playerIds,
    nicknames,
    rngSeed: opts.seed,
  };
}

/** 单局回归：从 setup 开始跑 maxTurns 轮简化回合，每步跑 invariants */
export function runBotMatch(opts: RunMatchOptions): MatchRunResult {
  const matchId = opts.matchId ?? `m-${opts.seed}`;
  const playerCount = opts.playerCount ?? 5;
  const maxTurns = opts.maxTurns ?? 20;
  const rand = opts.rand ?? mulberry32FromSeed(opts.seed);
  const violations: InvariantViolation[] = [];

  let state: SetupState;
  try {
    state = createInitialState(buildMatchSetupInput({ matchId, seed: opts.seed, playerCount }));
    state = {
      ...state,
      phase: 'playing',
      currentPlayerID: state.playerOrder[0] ?? '',
      dreamMasterID: state.playerOrder[state.playerOrder.length - 1] ?? '',
      turnPhase: 'turnStart',
      turnNumber: 1,
    };
    // 梦主派发
    if (state.dreamMasterID && state.players[state.dreamMasterID]) {
      state = {
        ...state,
        players: {
          ...state.players,
          [state.dreamMasterID]: {
            ...state.players[state.dreamMasterID]!,
            faction: 'master',
          },
        },
      };
    }
  } catch (err) {
    return {
      matchId,
      ok: false,
      turnsSimulated: 0,
      violations: [],
      error: (err as Error).message,
    };
  }

  let turnsSimulated = 0;
  try {
    for (let i = 0; i < maxTurns * 4; i++) {
      state = advanceStep(state, rand);
      const v = checkInvariants(state);
      if (v.length > 0) {
        violations.push(...v);
        return { matchId, ok: false, turnsSimulated, violations };
      }
      if (state.turnPhase === 'turnEnd') turnsSimulated++;
      if (state.winner !== null) break;
    }
  } catch (err) {
    return {
      matchId,
      ok: false,
      turnsSimulated,
      violations,
      error: (err as Error).message,
    };
  }

  return { matchId, ok: true, turnsSimulated, violations };
}

/** 单步推进简化回合（纯函数，只依赖 state + rand） */
export function advanceStep(state: SetupState, rand: () => number): SetupState {
  switch (state.turnPhase) {
    case 'turnStart':
      return { ...state, turnPhase: 'draw' };
    case 'draw':
      return drawPhase(state, rand);
    case 'action':
      return { ...state, turnPhase: 'discard' };
    case 'discard':
      return discardPhase(state);
    case 'turnEnd':
      return rotateToNextPlayer(state);
    default:
      return state;
  }
}

/** 抽牌阶段：给当前玩家 +2 张简化卡 */
function drawPhase(state: SetupState, rand: () => number): SetupState {
  const pid = state.currentPlayerID;
  if (!pid || !state.players[pid]) {
    return { ...state, turnPhase: 'action' };
  }
  const p = state.players[pid];
  // 生成 2 张伪卡
  const newCards: CardID[] = [
    `draw_${Math.floor(rand() * 1e6)}` as CardID,
    `draw_${Math.floor(rand() * 1e6)}` as CardID,
  ];
  return {
    ...state,
    turnPhase: 'action',
    players: {
      ...state.players,
      [pid]: { ...p, hand: [...p.hand, ...newCards] },
    },
  };
}

/** 弃牌阶段：手牌 > HAND_LIMIT 时弃到上限 */
function discardPhase(state: SetupState): SetupState {
  const pid = state.currentPlayerID;
  if (!pid || !state.players[pid]) {
    return { ...state, turnPhase: 'turnEnd' };
  }
  const p = state.players[pid];
  if (p.hand.length <= HAND_LIMIT) return { ...state, turnPhase: 'turnEnd' };
  return {
    ...state,
    turnPhase: 'turnEnd',
    players: {
      ...state.players,
      [pid]: { ...p, hand: p.hand.slice(0, HAND_LIMIT) },
    },
  };
}

/** 切换到下一个活着的玩家 */
function rotateToNextPlayer(state: SetupState): SetupState {
  const order = state.playerOrder;
  const currentIdx = order.indexOf(state.currentPlayerID);
  for (let i = 1; i <= order.length; i++) {
    const nextIdx = (currentIdx + i) % order.length;
    const next = order[nextIdx];
    if (next && state.players[next]?.isAlive) {
      return {
        ...state,
        currentPlayerID: next,
        turnPhase: 'turnStart',
        turnNumber: state.turnNumber + (nextIdx <= currentIdx ? 1 : 0),
      };
    }
  }
  // 没有活玩家：结束
  return { ...state, turnPhase: 'turnEnd', winner: 'master', winReason: 'all_thieves_dead' };
}

// === 批量跑 ===

export function runBotBatch(opts: {
  readonly count: number;
  readonly baseSeed?: string;
  readonly playerCount?: number;
  readonly maxTurns?: number;
  readonly onProgress?: (done: number, total: number) => void;
}): BatchReport {
  const count = opts.count;
  const baseSeed = opts.baseSeed ?? 'regression';
  const results: MatchRunResult[] = [];
  for (let i = 0; i < count; i++) {
    const seed = `${baseSeed}-${i}`;
    const option: RunMatchOptions = {
      seed,
      matchId: `${baseSeed}-m${i}`,
      ...(opts.playerCount !== undefined ? { playerCount: opts.playerCount } : {}),
      ...(opts.maxTurns !== undefined ? { maxTurns: opts.maxTurns } : {}),
    };
    const r = runBotMatch(option);
    results.push(r);
    opts.onProgress?.(i + 1, count);
  }
  return summarize(results);
}

export function summarize(results: readonly MatchRunResult[]): BatchReport {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const totalTurns = results.reduce((s, r) => s + r.turnsSimulated, 0);
  const ruleCount = new Map<string, number>();
  for (const r of results) {
    for (const v of r.violations) {
      ruleCount.set(v.rule, (ruleCount.get(v.rule) ?? 0) + 1);
    }
  }
  const topViolations = [...ruleCount.entries()]
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count);
  return {
    totalMatches: results.length,
    passed,
    failed,
    passRate: results.length > 0 ? passed / results.length : 0,
    totalTurns,
    avgTurnsPerMatch: results.length > 0 ? totalTurns / results.length : 0,
    topViolations,
    failedMatches: results.filter((r) => !r.ok),
  };
}
