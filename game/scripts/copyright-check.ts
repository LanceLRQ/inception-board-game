#!/usr/bin/env tsx
// 版权合规终检 CLI
// 对外产物不得出现内部开发文档的引用与排期编号
//
// 两类扫描：文档与文案用 INTERNAL_TERM_RULES，源码与工程配置用 SOURCE_RULES
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
  INTERNAL_TERM_RULES,
  SOURCE_RULES,
  isScanTarget,
  isSourceScanTarget,
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
  const docFilesScanned: string[] = [];
  const sourceFilesScanned: string[] = [];

  walk(REPO_ROOT, (abs) => {
    const rel = relative(REPO_ROOT, abs);
    // 两类目标重叠时（如 i18n 文案）以文档规则为准
    let rules;
    if (isScanTarget(rel)) {
      docFilesScanned.push(rel);
      rules = INTERNAL_TERM_RULES;
    } else if (isSourceScanTarget(rel)) {
      sourceFilesScanned.push(rel);
      rules = SOURCE_RULES;
    } else {
      return;
    }
    try {
      const text = readFileSync(abs, 'utf-8');
      violations.push(...scanText(text, rel, rules));
    } catch {
      // 非 UTF-8 / 无权读：跳过
    }
  });

  const report = summarize(violations);
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          scanned: docFilesScanned.length + sourceFilesScanned.length,
          scannedDocs: docFilesScanned.length,
          scannedSources: sourceFilesScanned.length,
          violations,
          summary: report,
        },
        null,
        2,
      ),
    );
    return report.total > 0 ? 1 : 0;
  }

  console.log(`[copyright:check] 扫描文件数（文档与文案）: ${docFilesScanned.length}`);
  console.log(`[copyright:check] 扫描文件数（源码与配置）: ${sourceFilesScanned.length}`);
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
