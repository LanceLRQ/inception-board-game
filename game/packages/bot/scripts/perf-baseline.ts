#!/usr/bin/env tsx
// Move P95 性能基线脚本
// 对照：plans/tasks.md P1 · MVP 性能基线报告（Move P95）
//
// 做法：
//   - 用 matchRunner 跑 N 局简化回合
//   - 对每一步 advanceStep 记录 monotonic 时间（performance.now()）
//   - 输出 p50/p95/p99、throughput、总 invariant 通过率
//
// 用法：
//   pnpm --filter @icgame/bot perf
//   pnpm --filter @icgame/bot perf -- --count 500 --players 6

import { performance } from 'node:perf_hooks';
import { advanceStep, buildMatchSetupInput, mulberry32FromSeed } from '../src/matchRunner.js';
import { createInitialState, type SetupState } from '@icgame/game-engine/setup';

interface Args {
  count: number;
  players: number;
  turns: number;
  seed: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    count: 200,
    players: 5,
    turns: 25,
    seed: `perf-${new Date().toISOString().slice(0, 10)}`,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    switch (flag) {
      case '--count':
        if (val) args.count = Math.max(1, parseInt(val, 10));
        i++;
        break;
      case '--players':
        if (val) args.players = Math.max(4, Math.min(10, parseInt(val, 10)));
        i++;
        break;
      case '--turns':
        if (val) args.turns = Math.max(1, parseInt(val, 10));
        i++;
        break;
      case '--seed':
        if (val) args.seed = val;
        i++;
        break;
    }
  }
  return args;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? 0;
}

function formatMs(n: number): string {
  if (n < 1) return `${(n * 1000).toFixed(1)}μs`;
  if (n < 1000) return `${n.toFixed(3)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[perf-baseline] count=${args.count} players=${args.players} turns=${args.turns}`);
  console.log(`[perf-baseline] seed=${args.seed}`);

  const stepDurations: number[] = [];
  const matchDurations: number[] = [];

  const matchStart = performance.now();

  for (let m = 0; m < args.count; m++) {
    const seed = `${args.seed}-${m}`;
    const matchId = `m${m}`;
    const rand = mulberry32FromSeed(seed);

    const matchT0 = performance.now();

    // 初始化
    let state: SetupState = createInitialState(
      buildMatchSetupInput({ matchId, seed, playerCount: args.players }),
    );
    state = {
      ...state,
      phase: 'playing',
      currentPlayerID: state.playerOrder[0] ?? '',
      dreamMasterID: state.playerOrder[state.playerOrder.length - 1] ?? '',
      turnPhase: 'turnStart',
      turnNumber: 1,
    };
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

    // 跑步
    for (let i = 0; i < args.turns * 4; i++) {
      const t0 = performance.now();
      state = advanceStep(state, rand);
      const t1 = performance.now();
      stepDurations.push(t1 - t0);
      if (state.winner !== null) break;
    }

    matchDurations.push(performance.now() - matchT0);
  }

  const totalTime = performance.now() - matchStart;

  const sortedSteps = [...stepDurations].sort((a, b) => a - b);
  const sortedMatches = [...matchDurations].sort((a, b) => a - b);

  const p50 = percentile(sortedSteps, 0.5);
  const p95 = percentile(sortedSteps, 0.95);
  const p99 = percentile(sortedSteps, 0.99);
  const avg = stepDurations.reduce((s, n) => s + n, 0) / Math.max(1, stepDurations.length);
  const throughput = stepDurations.length / (totalTime / 1000);

  console.log('');
  console.log('=== Move P95 基线报告 ===');
  console.log(`局数         : ${args.count}`);
  console.log(`玩家数       : ${args.players}`);
  console.log(`步总数       : ${stepDurations.length}`);
  console.log(`总耗时       : ${formatMs(totalTime)}`);
  console.log(`吞吐         : ${throughput.toFixed(0)} steps/s`);
  console.log('');
  console.log('Step 耗时分布:');
  console.log(`  avg        : ${formatMs(avg)}`);
  console.log(`  p50        : ${formatMs(p50)}`);
  console.log(`  p95        : ${formatMs(p95)}`);
  console.log(`  p99        : ${formatMs(p99)}`);
  console.log('');
  console.log('单局耗时分布:');
  console.log(
    `  avg        : ${formatMs(matchDurations.reduce((s, n) => s + n, 0) / Math.max(1, matchDurations.length))}`,
  );
  console.log(`  p50        : ${formatMs(percentile(sortedMatches, 0.5))}`);
  console.log(`  p95        : ${formatMs(percentile(sortedMatches, 0.95))}`);
  console.log(`  p99        : ${formatMs(percentile(sortedMatches, 0.99))}`);
  console.log('========================');

  // 写入 JSON（便于 CI 对比）
  const outPath = process.env.PERF_OUTPUT ?? 'perf-baseline.json';
  const fs = await import('node:fs');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        args,
        steps: stepDurations.length,
        totalMs: totalTime,
        throughputStepsPerSec: throughput,
        stepAvgMs: avg,
        stepP50Ms: p50,
        stepP95Ms: p95,
        stepP99Ms: p99,
      },
      null,
      2,
    ),
  );
  console.log(`[perf-baseline] 写入 ${outPath}`);
}

main().catch((err) => {
  console.error('[perf-baseline] 失败', err);
  process.exit(1);
});
