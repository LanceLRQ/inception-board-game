#!/usr/bin/env tsx
// 版权合规终检 CLI
// 对照：CLAUDE.local.md 核心纪律 1 / plans/tasks.md W9 版权合规终检
//
// 用法：
//   pnpm run copyright:check          # 扫描仓库根 + docs + game/
//   pnpm run copyright:check --json   # 机器可读输出
//
// 退出码：
//   0 无违规
//   1 有违规

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isScanTarget,
  scanText,
  summarize,
  type Violation,
} from '../packages/shared/src/copyrightCheck/rules.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(__filename, '../../..');

function walk(dir: string, onFile: (abs: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === '.git' || name === 'node_modules' || name === 'dist' || name === '.turbo') {
      continue;
    }
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs, onFile);
    else onFile(abs);
  }
}

function main(): number {
  const asJson = process.argv.includes('--json');
  const violations: Violation[] = [];
  const filesScanned: string[] = [];

  walk(REPO_ROOT, (abs) => {
    const rel = relative(REPO_ROOT, abs);
    if (!isScanTarget(rel)) return;
    filesScanned.push(rel);
    try {
      const text = readFileSync(abs, 'utf-8');
      violations.push(...scanText(text, rel));
    } catch {
      // 非 UTF-8 / 无权读：跳过
    }
  });

  const report = summarize(violations);
  if (asJson) {
    console.log(
      JSON.stringify({ scanned: filesScanned.length, violations, summary: report }, null, 2),
    );
    return report.total > 0 ? 1 : 0;
  }

  console.log(`[copyright:check] 扫描文件数: ${filesScanned.length}`);
  console.log(`[copyright:check] 违规总数: ${report.total}`);
  if (report.total === 0) {
    console.log('✅ 合规检查通过');
    return 0;
  }

  console.log('\n=== 按规则聚合 ===');
  for (const [rule, n] of Object.entries(report.byRule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rule}: ${n}`);
  }

  console.log('\n=== 按文件聚合（top 10） ===');
  const topFiles = Object.entries(report.byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [file, n] of topFiles) {
    console.log(`  ${file}: ${n}`);
  }

  console.log('\n=== 违规明细（最多 30 条） ===');
  for (const v of violations.slice(0, 30)) {
    console.log(`  [${v.rule}] ${v.file}:${v.line}`);
    console.log(`    > ${v.text}`);
    if (v.suggestion) console.log(`    建议: ${v.suggestion}`);
  }
  if (violations.length > 30) {
    console.log(`\n  ...（省略后续 ${violations.length - 30} 条，使用 --json 查看全部）`);
  }

  console.log('\n❌ 合规检查未通过');
  return 1;
}

process.exit(main());
