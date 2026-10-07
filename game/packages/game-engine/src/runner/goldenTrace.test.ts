// 黄金轨迹：把「当前引擎的对局行为」钉成一份逐步哈希基线。
//
// 守护什么
//   现有的重放、差分测试只能说明引擎「自洽」：同一串 move 重放得到同一个结果，
//   或与 boardgame.io 的归约器一致。一次结构重构若悄悄改变了结果（骰值修正、结算顺序、
//   谁能行动、哪些请求被拒绝……），只要改完仍然自洽，它们发现不了。
//   这里用固定种子、完全确定的选 move 策略（testing/goldenDriver.ts）把 4–10 人的整局各跑若干遍，
//   逐步记录「座位、move、是否被接受」，并把每一步接受后的完整状态（含随机流状态）规范化后的哈希
//   并入滚动哈希。基线只存每局的种子、人数、步数、结果摘要、最终哈希与每 50 步的检查点哈希，
//   不存状态本身。
//
// 基线文件：同目录 goldenTrace.baseline.txt，每局一行，纯文本，便于看 diff。
//
// 什么时候可以更新基线
//   只有「有意改变对局行为」的提交才可以更新，并且必须在提交说明里写明原因（改了哪条规则、为什么）。
//   纯重构（行为不变）的提交里，基线变化就是 bug：先找出分叉再改代码，不要更新基线。
//   更新方式（在 game/ 目录下）：
//     UPDATE_GOLDEN=1 pnpm --filter @icgame/game-engine exec vitest run src/runner/goldenTrace.test.ts
//
// 分叉时怎么定位
//   1. 失败信息会列出分叉的对局、第几个检查点（即第几步到第几步之间）开始不一致，
//      并重放该局，把这个窗口内的每一步（座位、move、接受或拒绝）打印出来。
//   2. 要精确到某一步：先在改动之前的提交上设 GOLDEN_DUMP=某个目录 跑一遍本测试，
//      再在改动之后换另一个目录跑一遍，两个目录里同名的 .log 文件（每步一行：序号、座位、move、
//      接受情况、状态哈希、滚动哈希）用 diff 比较，第一处不同的行就是分叉的那一步。
//        GOLDEN_DUMP=/tmp/golden-before pnpm --filter @icgame/game-engine exec \
//          vitest run src/runner/goldenTrace.test.ts
//   3. 策略只依赖引擎「表现出来的行为」，不依赖 move 的形参名或定义顺序；
//      但新增、删除、改名 move，或改变行动权判定，都算行为变化。
//
// 规模取舍：7 种人数 × 每种 10 个种子 = 70 局，整份测试约 15 秒（开覆盖率统计时更慢）；
// 种子数量按「53 个角色全部出现」「全部行动牌都被打出」定，再少会有角色整体没被跑到。

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_CARDS, MASTER_CHARACTERS, THIEF_CHARACTERS } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import {
  canonicalize,
  runGoldenMatch,
  type GoldenCoverage,
  type GoldenRecord,
  type GoldenStepRecord,
} from '../testing/goldenDriver.js';

const BASELINE_FILE = fileURLToPath(new URL('./goldenTrace.baseline.txt', import.meta.url));

const PLAYER_COUNTS = [4, 5, 6, 7, 8, 9, 10] as const;
const SEEDS_PER_COUNT = 10;
const MAX_STEPS = 1200;
const CHECKPOINT_EVERY = 50;

/** 对局定义里全部 move 名 */
const ALL_MOVES: string[] = [
  ...new Set(
    Object.values(InceptionCityGame.phases).flatMap((p) =>
      Object.keys((p as { moves?: Record<string, unknown> }).moves ?? {}),
    ),
  ),
].sort();

/** 至少要有这个比例的 move 被成功执行过 */
const MIN_ACCEPTED_MOVE_RATIO = 0.9;

interface Game {
  record: GoldenRecord;
  coverage: GoldenCoverage;
}

function seedsFor(count: number): string[] {
  return Array.from({ length: SEEDS_PER_COUNT }, (_, i) => `s${count}-${i + 1}`);
}

function runAll(dumpDir: string | undefined): Game[] {
  const games: Game[] = [];
  if (dumpDir) mkdirSync(dumpDir, { recursive: true });
  for (const numPlayers of PLAYER_COUNTS) {
    for (const seed of seedsFor(numPlayers)) {
      const lines: string[] = [];
      const result = runGoldenMatch({
        numPlayers,
        seed,
        maxSteps: MAX_STEPS,
        checkpointEvery: CHECKPOINT_EVERY,
        onStep: dumpDir ? (step) => lines.push(formatStep(step)) : undefined,
      });
      if (dumpDir)
        writeFileSync(join(dumpDir, `${numPlayers}-${seed}.log`), `${lines.join('\n')}\n`);
      games.push(result);
    }
  }
  return games;
}

function formatStep(step: GoldenStepRecord): string {
  const verdict = step.accepted ? 'ok' : `rejected(${step.reason ?? '?'})`;
  const hash = step.stateHash ? step.stateHash.slice(0, 16) : '-';
  return `${step.index} seat=${step.seat} ${step.move} ${verdict} state=${hash} roll=${step.rolling.slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// 覆盖统计
// ---------------------------------------------------------------------------

interface Summary {
  charactersSeen: Set<string>;
  playedCards: Map<string, number>;
  acceptedMoves: Map<string, number>;
  pendingFields: Map<string, number>;
  ends: Map<string, number>;
  totalSteps: number;
  totalAccepted: number;
}

function summarize(games: readonly Game[]): Summary {
  const s: Summary = {
    charactersSeen: new Set(),
    playedCards: new Map(),
    acceptedMoves: new Map(),
    pendingFields: new Map(),
    ends: new Map(),
    totalSteps: 0,
    totalAccepted: 0,
  };
  const add = (map: Map<string, number>, key: string, n = 1): void => {
    map.set(key, (map.get(key) ?? 0) + n);
  };
  for (const { record, coverage } of games) {
    coverage.characters.forEach((id) => s.charactersSeen.add(id));
    for (const [k, v] of Object.entries(coverage.playedCards)) add(s.playedCards, k, v);
    for (const [k, v] of Object.entries(coverage.acceptedMoves)) add(s.acceptedMoves, k, v);
    for (const [k, v] of Object.entries(coverage.pendingFields)) add(s.pendingFields, k, v);
    add(s.ends, `${record.end}/${record.outcome}`);
    s.totalSteps += record.steps;
    s.totalAccepted += record.accepted;
  }
  return s;
}

/** 基线里「待结算字段」只记名字，按出现过与否 */
function sortedKeys(map: Map<string, number>): string[] {
  return [...map.keys()].sort();
}

// ---------------------------------------------------------------------------
// 基线文本
// ---------------------------------------------------------------------------

function formatBaseline(games: readonly Game[], summary: Summary): string {
  const neverAccepted = ALL_MOVES.filter((m) => !summary.acceptedMoves.has(m));
  const header = [
    '# 黄金轨迹基线（由 goldenTrace.test.ts 生成；更新方式与规则见该测试文件头部）',
    `# checkpointEvery=${CHECKPOINT_EVERY} maxSteps=${MAX_STEPS} games=${games.length}`,
    `# acceptedMoves=${summary.acceptedMoves.size}/${ALL_MOVES.length}`,
    `# neverAccepted=${neverAccepted.join(',')}`,
    `# pendingFieldsSeen=${sortedKeys(summary.pendingFields).join(',')}`,
    `# charactersSeen=${summary.charactersSeen.size} playedActionCards=${summary.playedCards.size}`,
  ];
  const lines = games.map(({ record: r }) =>
    [
      `n=${r.numPlayers}`,
      `seed=${r.seed}`,
      `steps=${r.steps}`,
      `accepted=${r.accepted}`,
      `end=${r.end}`,
      `outcome=${r.outcome}`,
      `final=${r.finalHash}`,
      `cp=${r.checkpoints.join(',')}`,
    ].join(' '),
  );
  return `${[...header, ...lines].join('\n')}\n`;
}

/** 解析基线里某一局的 cp 字段 */
function checkpointsOf(line: string): string[] {
  const m = / cp=(\S*)$/.exec(line);
  return m && m[1] ? m[1].split(',') : [];
}

/** 对比实际与基线，返回人能读的分叉说明；一致返回 null */
function explainDivergence(actual: readonly Game[], expectedText: string, actualText: string) {
  if (actualText === expectedText) return null;
  const expectedLines = expectedText.split('\n');
  const actualLines = actualText.split('\n');
  const messages: string[] = [];
  const byKey = new Map<string, string>();
  for (const line of expectedLines) {
    const m = /^n=(\d+) seed=(\S+) /.exec(line);
    if (m) byKey.set(`${m[1]}|${m[2]}`, line);
  }
  let shown = 0;
  for (const game of actual) {
    const { numPlayers, seed } = game.record;
    const want = byKey.get(`${numPlayers}|${seed}`);
    const got = actualLines.find((l) => l.startsWith(`n=${numPlayers} seed=${seed} `));
    if (want === got) continue;
    if (!want || !got) {
      messages.push(`对局 n=${numPlayers} seed=${seed}：基线里没有这一局（局数或种子变了）`);
      continue;
    }
    if (shown >= 3) continue;
    shown++;
    const wantCp = checkpointsOf(want);
    const gotCp = checkpointsOf(got);
    let at = 0;
    while (at < Math.min(wantCp.length, gotCp.length) && wantCp[at] === gotCp[at]) at++;
    const from = at * CHECKPOINT_EVERY + 1;
    const to = (at + 1) * CHECKPOINT_EVERY;
    messages.push(
      `对局 n=${numPlayers} seed=${seed}：第 ${from}–${to} 步之间开始分叉` +
        (at >= Math.min(wantCp.length, gotCp.length) ? '（最后一个检查点之后）' : ''),
    );
    // 重放这一局，打印窗口内的步骤
    const window: string[] = [];
    runGoldenMatch({
      numPlayers,
      seed,
      maxSteps: MAX_STEPS,
      checkpointEvery: CHECKPOINT_EVERY,
      onStep: (step) => {
        if (step.index >= from && step.index <= to) window.push(`    ${formatStep(step)}`);
      },
    });
    messages.push(...window);
  }
  const summaryDiff = actualLines
    .filter((l) => l.startsWith('#') && !expectedLines.includes(l))
    .map((l) => `  汇总行变化：${l}`);
  return [
    '对局行为与黄金轨迹基线不一致。纯重构提交不应改变行为；若确为有意的行为变更，',
    '请在提交说明里写明原因后用 UPDATE_GOLDEN=1 更新基线（详见本测试文件头部）。',
    ...messages,
    ...summaryDiff,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe('黄金轨迹', () => {
  let games: Game[] = [];
  let summary: Summary;
  let actualText = '';

  beforeAll(() => {
    games = runAll(process.env.GOLDEN_DUMP || undefined);
    summary = summarize(games);
    actualText = formatBaseline(games, summary);
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(BASELINE_FILE, actualText);
  }, 120_000);

  it('与入库基线逐字一致（含每步状态哈希折成的滚动哈希与检查点）', () => {
    const expectedText = readFileSync(BASELINE_FILE, 'utf-8');
    const explanation = explainDivergence(games, expectedText, actualText);
    expect(explanation, explanation ?? '').toBeNull();
  });

  it('局数与人数分布符合约定（4–10 人各 10 局）', () => {
    expect(games).toHaveLength(PLAYER_COUNTS.length * SEEDS_PER_COUNT);
    for (const n of PLAYER_COUNTS) {
      expect(games.filter((g) => g.record.numPlayers === n)).toHaveLength(SEEDS_PER_COUNT);
    }
  });

  it('每局都真的在推进：步数、接受数与终局', () => {
    for (const { record } of games) {
      expect(record.accepted, `${record.numPlayers}人 ${record.seed}`).toBeGreaterThan(50);
      expect(record.steps).toBeGreaterThanOrEqual(record.accepted);
      // 检查点数量与步数一致
      expect(record.checkpoints).toHaveLength(Math.floor(record.steps / CHECKPOINT_EVERY));
    }
    // 整体上绝大多数局要打到终局，而不是靠步数上限收尾
    const finished = games.filter((g) => g.record.end === 'gameover').length;
    expect(finished).toBeGreaterThanOrEqual(games.length * 0.9);
  });

  it('配置里的每个梦主与每个盗梦者角色至少在某一局里出现过', () => {
    const expected = [...MASTER_CHARACTERS, ...THIEF_CHARACTERS].map((c) => c.id);
    expect(expected).toHaveLength(53);
    const missing = expected.filter((id) => !summary.charactersSeen.has(id));
    expect(missing).toEqual([]);
  });

  it('每种行动牌至少被成功打出过一次', () => {
    const missing = ACTION_CARDS.map((c) => c.id as string).filter(
      (id) => !summary.playedCards.has(id),
    );
    expect(missing).toEqual([]);
  });

  it('被成功执行过的 move 占比不低于下限', () => {
    const ratio = summary.acceptedMoves.size / ALL_MOVES.length;
    expect(ratio).toBeGreaterThanOrEqual(MIN_ACCEPTED_MOVE_RATIO);
    // 没被接受过的 move 的名单记录在基线文件头（neverAccepted），这里只确认它们确实是引擎里的 move
    for (const name of summary.acceptedMoves.keys()) expect(ALL_MOVES).toContain(name);
  });

  it('出现过多种待应答状态（响应窗口、选择、分牌等）', () => {
    expect(summary.pendingFields.size).toBeGreaterThanOrEqual(10);
  });

  it('同一份代码两次运行得到逐字节相同的轨迹', () => {
    for (const [numPlayers, seed] of [
      [4, 'repeat-a'],
      [7, 'repeat-b'],
      [10, 'repeat-c'],
    ] as const) {
      const run = () =>
        runGoldenMatch({ numPlayers, seed, maxSteps: 300, checkpointEvery: CHECKPOINT_EVERY });
      expect(run().record).toEqual(run().record);
    }
  });

  it('不同种子得到不同的轨迹（哈希确实对状态敏感）', () => {
    const finals = new Set(games.map((g) => g.record.finalHash));
    expect(finals.size).toBe(games.length);
  });
});

describe('黄金轨迹 · 规范化序列化', () => {
  it('与对象键的插入顺序无关', () => {
    expect(canonicalize({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      canonicalize({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
  });

  it('丢弃 undefined 属性，数组里的 undefined 记为 null', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
    expect(canonicalize([undefined])).toBe('[null]');
  });

  it('值不同则序列化不同（含类型区分）', () => {
    expect(canonicalize({ a: 1 })).not.toBe(canonicalize({ a: '1' }));
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
    expect(canonicalize(null)).not.toBe(canonicalize('null'));
  });

  it('遇到 Map、Set 或函数时直接抛错，不悄悄漏掉内容', () => {
    expect(() => canonicalize(new Map())).toThrow();
    expect(() => canonicalize(new Set())).toThrow();
    expect(() => canonicalize({ f: () => 1 })).toThrow();
  });
});
