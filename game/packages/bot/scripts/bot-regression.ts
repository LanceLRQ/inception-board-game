#!/usr/bin/env tsx
// Bot 夜间回归 CLI：用引擎的对局运行器打全 Bot 对局，走真实 move 与引擎守卫
//
// 用法：
//   pnpm --filter @icgame/bot regression                 # 默认 100 局
//   pnpm --filter @icgame/bot regression -- --count 500 --players 8 --max-steps 5000
//   pnpm --filter @icgame/bot regression -- --seed nightly-2026-04-19
//
// 参数：
//   --count N       对局数（默认 100）
//   --players N     玩家数 4-10（默认 5）
//   --max-steps N   每局步数上限，每接受一个 move 算一步（默认 20000）；
//                   旧参数 --turns 已改名为它，语义由「回合数」变为「move 步数」
//   --seed S        种子前缀，第 i 局的种子是 S-i
//
// 退出码：
//   0 全部通过
//   1 存在未打到终局、被引擎拒绝的 move、或不变量违规的对局

import { runBotPlayout, type BotPlayoutResult } from '../src/playout.js';

interface Args {
  count: number;
  players: number;
  maxSteps: number;
  seed: string;
}

function parseIntArg(flag: string, raw: string | undefined): number {
  const n = raw === undefined ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    console.error(`[bot-regression] ${flag} 需要一个整数`);
    process.exit(2);
  }
  return n;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    count: 100,
    players: 5,
    maxSteps: 20000,
    seed: `nightly-${new Date().toISOString().slice(0, 10)}`,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    switch (flag) {
      case '--':
        break;
      case '--count':
        args.count = Math.max(1, parseIntArg(flag, val));
        i++;
        break;
      case '--players':
        args.players = Math.max(4, Math.min(10, parseIntArg(flag, val)));
        i++;
        break;
      case '--max-steps':
        args.maxSteps = Math.max(1, parseIntArg(flag, val));
        i++;
        break;
      case '--seed':
        if (val) args.seed = val;
        i++;
        break;
      default:
        console.error(`[bot-regression] 未知参数 ${String(flag)}（--turns 已改名为 --max-steps）`);
        process.exit(2);
    }
  }
  return args;
}

/** 一局的失败原因；通过返回 null */
function failureOf(r: BotPlayoutResult): string | null {
  if (r.invariantViolations.length > 0) return '不变量违规';
  if (r.rejected) return `move 被拒绝（${r.rejected.reason}）`;
  if (r.stalledOn) return '停滞：没有下一步可做';
  if (r.gameover === undefined) return '步数用尽仍未终局';
  return null;
}

const args = parseArgs(process.argv.slice(2));
console.log('[bot-regression] args:', args);

interface FailedMatch {
  seed: string;
  result: BotPlayoutResult;
  reason: string;
}

const startedAt = Date.now();
const failed: FailedMatch[] = [];
const violationCounts = new Map<string, number>();
let totalSteps = 0;

for (let i = 0; i < args.count; i++) {
  const seed = `${args.seed}-${i}`;
  const result = runBotPlayout({
    numPlayers: args.players,
    seed,
    maxSteps: args.maxSteps,
  });
  totalSteps += result.steps;
  for (const v of result.invariantViolations) {
    violationCounts.set(v.rule, (violationCounts.get(v.rule) ?? 0) + 1);
  }
  const reason = failureOf(result);
  if (reason !== null) failed.push({ seed, result, reason });
  const done = i + 1;
  if (done % Math.max(1, Math.floor(args.count / 10)) === 0 || done === args.count) {
    process.stdout.write(`\r  progress: ${done}/${args.count}`);
  }
}
const elapsedMs = Date.now() - startedAt;
process.stdout.write('\n');

const passed = args.count - failed.length;
console.log('\n=== Bot Regression Report ===');
console.log(`  matches:          ${args.count}`);
console.log(`  passed:           ${passed}`);
console.log(`  failed:           ${failed.length}`);
console.log(`  pass rate:        ${((passed / args.count) * 100).toFixed(2)}%`);
console.log(`  total steps:      ${totalSteps}`);
console.log(`  avg steps/match:  ${(totalSteps / args.count).toFixed(1)}`);
console.log(`  elapsed:          ${elapsedMs}ms`);

if (violationCounts.size > 0) {
  console.log('  top violations:');
  const top = [...violationCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [rule, count] of top) console.log(`    - ${rule}: ${count}`);
}

if (failed.length > 0) {
  console.log('\n=== Failed Match Samples (first 3) ===');
  for (const f of failed.slice(0, 3)) {
    const { result } = f;
    console.log(`  [${f.seed}] ${f.reason} · steps=${result.steps}`);
    if (result.rejected) {
      const { request, why, error } = result.rejected;
      console.log(`    rejected: ${JSON.stringify(request)} · ${why}`);
      if (error) console.log(`    error: ${String(error)}`);
    }
    if (result.stalledOn) console.log(`    stalled: ${JSON.stringify(result.stalledOn)}`);
    for (const v of result.invariantViolations.slice(0, 3)) {
      console.log(`    - [${v.rule}] step ${v.step}: ${v.message}`);
    }
  }
  process.exit(1);
}

console.log('\n✅ ALL GREEN');
process.exit(0);
