// 版权合规终检 · 纯规则模块
// 对照：CLAUDE.local.md 核心纪律 1、CLAUDE.md
//
// 对外产物（README/LICENSE/NOTICE/docs/源代码注释）严禁出现：
//   - 内部设计文档编号、ADR、Phase、Week、Spike、User Story、风险代号
//   - plans/design、plans/manual 路径引用
//
// 本模块仅导出纯函数，IO 由 copyright-check.ts 入口实现。

export interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly description: string;
  readonly suggestion?: string;
}

export interface Violation {
  readonly rule: string;
  readonly description: string;
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly suggestion?: string;
}

/** 对外产物禁止出现的内部术语规则（与 CLAUDE.local.md 第 1 条对齐） */
export const INTERNAL_TERM_RULES: readonly Rule[] = [
  {
    name: 'adr_reference',
    pattern: /\bADR[-_]?\d{1,4}\b/,
    description: 'ADR 编号引用（内部决策记录）',
    suggestion: '改为描述性语言（如"架构决策"/"技术选型"），不暴露 ADR 编号',
  },
  {
    name: 'phase_number',
    pattern: /\bPhase\s*[0-6]\b/,
    description: 'Phase 编号（内部里程碑）',
    suggestion: '改用"当前阶段"/"下一版本"等描述，不暴露 Phase 编号',
  },
  {
    name: 'spike_reference',
    pattern: /\bSpike\b/,
    description: 'Spike（内部技术验证代号）',
    suggestion: '改为"技术验证"/"原型"',
  },
  {
    name: 'week_reference',
    pattern: /\bWeek\s*\d{1,2}\b/,
    description: 'Week N 周次（内部排期）',
    suggestion: '去除或改为"后续版本"',
  },
  {
    name: 'user_story',
    pattern: /\bUS[-_]\d{1,4}\b/,
    description: 'User Story 编号（内部需求）',
    suggestion: '改用功能名称描述',
  },
  {
    name: 'risk_code',
    pattern: /\b[TO]\d{1,3}\b(?!\.)/,
    description: '内部风险代号（T17/O10 等）',
    suggestion: '改用风险描述文字',
  },
  {
    name: 'plans_design_path',
    pattern: /\bplans\/design\b/,
    description: 'plans/design/ 路径引用（内部目录）',
    suggestion: '引用公开路径（如 docs/manual/）或移除',
  },
  {
    name: 'plans_manual_path',
    pattern: /\bplans\/manual\b/,
    description: 'plans/manual/ 旧路径（已迁移到 docs/manual/）',
    suggestion: '改为 docs/manual/',
  },
  {
    name: 'design_doc_number',
    pattern: /\b\d{2}-[a-z]+(?:-[a-z]+)*\.md\b/i,
    description: '内部设计文档编号文件名（如 03-data-model.md）',
    suggestion: '不在对外文档中引用内部设计文件名',
  },
];

/** 每行判定：命中规则时返回违规详情 */
export function checkLine(
  line: string,
  file: string,
  lineNum: number,
  rules: readonly Rule[] = INTERNAL_TERM_RULES,
): Violation[] {
  const out: Violation[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(line)) {
      out.push({
        rule: rule.name,
        description: rule.description,
        file,
        line: lineNum,
        text: line.trim().slice(0, 200),
        ...(rule.suggestion ? { suggestion: rule.suggestion } : {}),
      });
    }
  }
  return out;
}

/** 全文扫描：按换行切分后逐行应用规则 */
export function scanText(
  text: string,
  file: string,
  rules: readonly Rule[] = INTERNAL_TERM_RULES,
): Violation[] {
  const lines = text.split(/\r?\n/);
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(...checkLine(lines[i]!, file, i + 1, rules));
  }
  return out;
}

/**
 * 判断路径是否为本次扫描目标。
 *
 * 白名单策略：只扫描真正对外产物，避免源代码注释 / 测试 / 原型误报。
 * 允许：
 *   - 仓库根：README.md / NOTICE / LICENSE / CLAUDE.md
 *   - docs/** 对外文档（含 docs/manual/ 规则原文、docs/ops/ 运维指南）
 *   - 各包的 i18n locales JSON（用户可见文案）
 * 排除：
 *   - plans/**（内部开发）
 *   - experimental_demo/**（原型）
 *   - 源代码 .ts/.tsx/.js（注释引用设计文档是合理的）
 *   - 测试、node_modules、dist 等
 */
export function isScanTarget(relPath: string): boolean {
  // 明确排除
  const excludePatterns = [
    /^plans\//,
    /^experimental_demo\//,
    /^node_modules\//,
    /\/node_modules\//,
    /^game\/node_modules\//,
    /\.turbo\//,
    /\/dist\//,
    /^dist\//,
    /\.tsbuildinfo$/,
    /CLAUDE\.local\.md$/,
    /\.env(\.|$)/,
    /pnpm-lock\.yaml$/,
    /\/generated\//,
    /\/__snapshots__\//,
    /\.test\.(ts|tsx|js)$/,
    /package-lock\.json$/,
    /\/public\/cards\//,
    /\/public\/dice\//,
    /\/public\/sfx\//,
    /\/playwright-report\//,
    /\/test-results\//,
  ];
  if (excludePatterns.some((re) => re.test(relPath))) return false;

  // 白名单：对外产物
  // 1. 仓库根对外文件
  const rootPublicFiles = new Set(['README.md', 'NOTICE', 'LICENSE', 'CLAUDE.md']);
  if (rootPublicFiles.has(relPath)) return true;

  // 2. docs/** 所有 markdown
  if (/^docs\/.+\.md$/i.test(relPath)) return true;

  // 3. i18n locales（用户可见文案）
  if (/\/i18n\/locales\/[^/]+\.(json|ya?ml)$/i.test(relPath)) return true;

  return false;
}

/** 汇总：按 rule 聚合违规计数 */
export function summarize(violations: readonly Violation[]): {
  readonly total: number;
  readonly byRule: Readonly<Record<string, number>>;
  readonly byFile: Readonly<Record<string, number>>;
} {
  const byRule: Record<string, number> = {};
  const byFile: Record<string, number> = {};
  for (const v of violations) {
    byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
    byFile[v.file] = (byFile[v.file] ?? 0) + 1;
  }
  return { total: violations.length, byRule, byFile };
}
