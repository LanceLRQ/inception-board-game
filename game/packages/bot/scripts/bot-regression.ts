#!/usr/bin/env tsx
// Bot 夜间回归 CLI
// 对照：plans/design/10-roadmap-risk.md W9 · Bot 夜间 100 局回归
//
// 用法：
//   pnpm --filter @icgame/bot regression              # 默认 100 局
//   pnpm --filter @icgame/bot regression -- --count 500 --players 8 --turns 30
//   pnpm --filter @icgame/bot regression -- --seed nightly-2026-04-19
//
// 退出码：
//   0 全部通过
//   1 存在 invariant 违规（任何一局失败）

import { runBotBatch } from '../src/matchRunner.js';

interface Args {
  count: number;
  players: number;
  turns: number;
  seed: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    count: 100,
    players: 5,
    turns: 25,
    seed: `nightly-${new Date().toISOString().slice(0, 10)}`,
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

const args = parseArgs(process.argv.slice(2));
console.log('[bot-regression] args:', args);

const startedAt = Date.now();
const report = runBotBatch({
  count: args.count,
  baseSeed: args.seed,
  playerCount: args.players,
  maxTurns: args.turns,
  onProgress: (done, total) => {
    if (done % Math.max(1, Math.floor(total / 10)) === 0 || done === total) {
      process.stdout.write(`\r  progress: ${done}/${total}`);
    }
  },
});
const elapsedMs = Date.now() - startedAt;
process.stdout.write('\n');

console.log('\n=== Bot Regression Report ===');
console.log(`  matches:          ${report.totalMatches}`);
console.log(`  passed:           ${report.passed}`);
console.log(`  failed:           ${report.failed}`);
console.log(`  pass rate:        ${(report.passRate * 100).toFixed(2)}%`);
console.log(`  total turns:      ${report.totalTurns}`);
console.log(`  avg turns/match:  ${report.avgTurnsPerMatch.toFixed(1)}`);
console.log(`  elapsed:          ${elapsedMs}ms`);

if (report.topViolations.length > 0) {
  console.log('  top violations:');
  for (const v of report.topViolations.slice(0, 10)) {
    console.log(`    - ${v.rule}: ${v.count}`);
  }
}

if (report.failed > 0) {
  console.log('\n=== Failed Match Samples (first 3) ===');
  for (const r of report.failedMatches.slice(0, 3)) {
    console.log(`  [${r.matchId}] turns=${r.turnsSimulated}`);
    if (r.error) console.log(`    error: ${r.error}`);
    for (const v of r.violations.slice(0, 3)) {
      console.log(`    - [${v.rule}] ${v.message}`);
    }
  }
  process.exit(1);
}

console.log('\n✅ ALL GREEN');
process.exit(0);
