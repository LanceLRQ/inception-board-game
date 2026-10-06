import { describe, it, expect } from 'vitest';
import {
  checkLine,
  scanText,
  isScanTarget,
  isSourceScanTarget,
  summarize,
  INTERNAL_TERM_RULES,
  SOURCE_RULES,
} from './rules.js';

describe('checkLine · 规则命中', () => {
  it('flags ADR-001 style references', () => {
    const v = checkLine('see ADR-042 for details', 'a.md', 1);
    expect(v.map((x) => x.rule)).toContain('adr_reference');
  });

  it('flags ADR42 without dash', () => {
    const v = checkLine('contract: ADR42', 'a.md', 1);
    expect(v.some((x) => x.rule === 'adr_reference')).toBe(true);
  });

  it('flags Phase 2/Phase 3', () => {
    const v = checkLine('This runs in Phase 2 of the roadmap', 'readme.md', 10);
    expect(v.map((x) => x.rule)).toContain('phase_number');
  });

  it('flags Spike references', () => {
    const v = checkLine('We ran a Spike on PWA performance', 'notes.md', 1);
    expect(v.map((x) => x.rule)).toContain('spike_reference');
  });

  it('flags Week N numbers', () => {
    const v = checkLine('Scheduled for Week 8', 'plan.md', 1);
    expect(v.map((x) => x.rule)).toContain('week_reference');
  });

  it('flags User Story codes', () => {
    const v = checkLine('Refer to US-017 for acceptance criteria', 'readme.md', 1);
    expect(v.map((x) => x.rule)).toContain('user_story');
  });

  it('flags docs/_internal path', () => {
    const v = checkLine('See docs/_internal/design/03-data-model.md', 'a.md', 1);
    // 命中两条：internal_docs_path + design_doc_number
    expect(v.map((x) => x.rule)).toContain('internal_docs_path');
    expect(v.map((x) => x.rule)).toContain('design_doc_number');
  });

  it('does not flag public docs paths as internal', () => {
    const v = checkLine('规则原文见 docs/manual/ 与 docs/superpowers/specs/', 'a.md', 1);
    expect(v.map((x) => x.rule)).not.toContain('internal_docs_path');
  });

  it('flags plans/design path', () => {
    const v = checkLine('See plans/design/03-data-model.md', 'a.md', 1);
    // 命中两条：plans_design_path + design_doc_number
    expect(v.map((x) => x.rule)).toContain('plans_design_path');
    expect(v.map((x) => x.rule)).toContain('design_doc_number');
  });

  it('flags plans/manual path', () => {
    const v = checkLine('original rules in plans/manual/', 'a.md', 1);
    expect(v.map((x) => x.rule)).toContain('plans_manual_path');
  });

  it('flags design doc filename pattern', () => {
    const v = checkLine('阅读 06-frontend-design.md 了解', 'readme.md', 1);
    expect(v.map((x) => x.rule)).toContain('design_doc_number');
  });

  it('flags internal risk code T17', () => {
    const v = checkLine('blocked on T17 resolution', 'notes.md', 1);
    expect(v.map((x) => x.rule)).toContain('risk_code');
  });

  it('does not flag normal English sentences', () => {
    expect(checkLine('Welcome to the game', 'a.md', 1)).toEqual([]);
    expect(checkLine('点击开始游戏体验盗梦都市', 'a.md', 1)).toEqual([]);
  });

  it('includes suggestion field when rule has one', () => {
    const [v] = checkLine('See ADR-001', 'a.md', 1);
    expect(v?.suggestion).toBeTruthy();
  });
});

describe('scanText · 多行', () => {
  it('returns file + line for each violation', () => {
    const text = [
      'line 1 normal',
      'line 2 mentions ADR-042',
      'line 3 normal',
      'line 4 mentions Phase 2',
    ].join('\n');
    const v = scanText(text, 'test.md');
    expect(v).toHaveLength(2);
    expect(v[0]!.file).toBe('test.md');
    expect(v[0]!.line).toBe(2);
    expect(v[1]!.line).toBe(4);
  });

  it('returns empty on clean text', () => {
    expect(scanText('This is all fine.\nNormal content.', 'a.md')).toEqual([]);
  });

  it('handles Windows line endings', () => {
    const text = 'line 1\r\nADR-001 here\r\nline 3';
    const v = scanText(text, 'a.md');
    expect(v).toHaveLength(1);
    expect(v[0]!.line).toBe(2);
  });
});

describe('isScanTarget · 白名单目标', () => {
  it('includes root public files (README/NOTICE/LICENSE/CLAUDE.md)', () => {
    expect(isScanTarget('README.md')).toBe(true);
    expect(isScanTarget('NOTICE')).toBe(true);
    expect(isScanTarget('LICENSE')).toBe(true);
    expect(isScanTarget('CLAUDE.md')).toBe(true);
  });

  it('includes docs/** markdown', () => {
    expect(isScanTarget('docs/ops/deploy.md')).toBe(true);
    expect(isScanTarget('docs/manual/01-game-overview.md')).toBe(true);
    expect(isScanTarget('docs/superpowers/specs/2026-01-01-sample-design.md')).toBe(true);
  });

  it('includes i18n locales json', () => {
    expect(isScanTarget('game/packages/client/src/i18n/locales/zh-CN.json')).toBe(true);
    expect(isScanTarget('game/packages/client/src/i18n/locales/en-US.json')).toBe(true);
  });

  it('excludes source code (scanned separately by isSourceScanTarget)', () => {
    expect(isScanTarget('game/packages/client/src/App.tsx')).toBe(false);
    expect(isScanTarget('game/packages/shared/src/types.ts')).toBe(false);
  });

  it('excludes test files', () => {
    expect(isScanTarget('game/packages/game-engine/src/foo.test.ts')).toBe(false);
  });

  it('excludes docs/_internal/ directory (internal docs)', () => {
    expect(isScanTarget('docs/_internal/design/00-overview.md')).toBe(false);
    expect(isScanTarget('docs/_internal/TASKS.md')).toBe(false);
    expect(isScanTarget('docs/_internal/audit/AUDIT-2026-04-21-engine-review.md')).toBe(false);
  });

  it('excludes experimental_demo/ (internal prototypes)', () => {
    expect(isScanTarget('experimental_demo/base58-shortlink/README.md')).toBe(false);
  });

  it('excludes node_modules / dist / generated / turbo', () => {
    expect(isScanTarget('node_modules/foo/index.js')).toBe(false);
    expect(isScanTarget('dist/main.js')).toBe(false);
    expect(isScanTarget('.turbo/cache')).toBe(false);
    expect(isScanTarget('game/packages/server/src/generated/prisma/client.ts')).toBe(false);
  });

  it('excludes CLAUDE.local.md', () => {
    expect(isScanTarget('CLAUDE.local.md')).toBe(false);
  });

  it('excludes .env* / snapshots / lockfile', () => {
    expect(isScanTarget('game/.env.example')).toBe(false);
    expect(isScanTarget('game/packages/game-engine/src/engine/__snapshots__/x.snap')).toBe(false);
    expect(isScanTarget('game/pnpm-lock.yaml')).toBe(false);
  });

  it('excludes binary asset dirs', () => {
    expect(isScanTarget('game/packages/client/public/cards/manifest.json')).toBe(false);
    expect(isScanTarget('game/packages/client/public/dice/dice-red-1.svg')).toBe(false);
    expect(isScanTarget('game/packages/client/public/sfx/README.md')).toBe(false);
  });

  it('excludes arbitrary source html/css/png/woff', () => {
    expect(isScanTarget('game/packages/client/index.html')).toBe(false);
    expect(isScanTarget('image.png')).toBe(false);
    expect(isScanTarget('font.woff2')).toBe(false);
  });
});

describe('summarize · 聚合', () => {
  it('counts by rule and by file', () => {
    const vs = [
      { rule: 'adr_reference', description: '', file: 'a.md', line: 1, text: '' },
      { rule: 'adr_reference', description: '', file: 'a.md', line: 2, text: '' },
      { rule: 'phase_number', description: '', file: 'b.md', line: 3, text: '' },
    ];
    const r = summarize(vs);
    expect(r.total).toBe(3);
    expect(r.byRule['adr_reference']).toBe(2);
    expect(r.byRule['phase_number']).toBe(1);
    expect(r.byFile['a.md']).toBe(2);
    expect(r.byFile['b.md']).toBe(1);
  });

  it('handles empty input', () => {
    const r = summarize([]);
    expect(r.total).toBe(0);
    expect(r.byRule).toEqual({});
  });
});

describe('INTERNAL_TERM_RULES · 覆盖', () => {
  it('has at least 9 rules', () => {
    expect(INTERNAL_TERM_RULES.length).toBeGreaterThanOrEqual(9);
  });

  it('every rule has non-empty name and description', () => {
    for (const r of INTERNAL_TERM_RULES) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
    }
  });
});

const sourceRuleNames = (line: string): string[] =>
  checkLine(line, 'a.ts', 1, SOURCE_RULES).map((v) => v.rule);

describe('SOURCE_RULES · 命中', () => {
  it('reuses existing INTERNAL_TERM_RULES objects instead of copying them', () => {
    for (const name of [
      'adr_reference',
      'phase_number',
      'spike_reference',
      'week_reference',
      'user_story',
      'internal_docs_path',
      'plans_design_path',
      'plans_manual_path',
    ]) {
      const inInternal = INTERNAL_TERM_RULES.find((r) => r.name === name);
      expect(inInternal).toBeDefined();
      expect(SOURCE_RULES).toContain(inInternal);
    }
  });

  it('does not include risk_code or design_doc_number', () => {
    const names = SOURCE_RULES.map((r) => r.name);
    expect(names).not.toContain('risk_code');
    expect(names).not.toContain('design_doc_number');
  });

  it('flags docs/_internal path', () => {
    expect(sourceRuleNames('// docs/_internal/design/03-data-model.md')).toContain(
      'internal_docs_path',
    );
  });

  it('flags ADR / Phase / Spike / Week / US codes', () => {
    expect(sourceRuleNames('// ADR-042 失败降级')).toContain('adr_reference');
    expect(sourceRuleNames('// Phase 2 再做')).toContain('phase_number');
    expect(sourceRuleNames('// Spike 验证')).toContain('spike_reference');
    expect(sourceRuleNames('// Week 8')).toContain('week_reference');
    expect(sourceRuleNames('// US-001')).toContain('user_story');
  });

  describe('week_abbrev', () => {
    it.each([
      '// W10 · 梦主 helper',
      '// W19.5 · xxx',
      '// W20.4 补实装',
      "describe('W16-A · 梦主公共 helper', () => {})",
      '// W19-B F3：由 passResponse 共享',
      '（见 W10-R1）',
    ])('flags %s', (line) => {
      expect(sourceRuleNames(line)).toContain('week_abbrev');
    });

    it.each([
      '// 参见 W3C 规范',
      'const sw10 = 1',
      'const hex = "0xAW10F"',
      'const TEST_W10 = 2',
      'const T1 = 1',
      'const O2 = 2',
      'const W = 1',
      'const W100 = 1',
    ])('does not flag %s', (line) => {
      expect(sourceRuleNames(line)).not.toContain('week_abbrev');
    });
  });

  describe('internal_filename', () => {
    it('flags TASKS.md and CLAUDE.local.md', () => {
      expect(sourceRuleNames('// 见 TASKS.md')).toContain('internal_filename');
      expect(sourceRuleNames('// 见 CLAUDE.local.md 约定')).toContain('internal_filename');
    });

    it('does not flag unrelated names', () => {
      expect(sourceRuleNames('// MY_TASKS.mdx')).not.toContain('internal_filename');
      expect(sourceRuleNames('// CLAUDE.md')).not.toContain('internal_filename');
    });
  });

  describe('design_doc_filename', () => {
    it('flags bare design doc file names', () => {
      expect(sourceRuleNames('// 对照 05-card-system.md')).toContain('design_doc_filename');
      expect(sourceRuleNames('// 06c-match-table-layout.md 座位算法')).toContain(
        'design_doc_filename',
      );
      expect(sourceRuleNames('// AUDIT-2026-04-22-skill-status.md')).toContain(
        'design_doc_filename',
      );
    });

    it('flags design doc under docs/_internal', () => {
      expect(sourceRuleNames('docs/_internal/design/03-data-model.md')).toContain(
        'design_doc_filename',
      );
    });

    it('does not flag public docs/manual references', () => {
      expect(sourceRuleNames('// 对照：docs/manual/03-game-flow.md 死亡规则')).toEqual([]);
      expect(sourceRuleNames('// docs/manual/05-dream-thieves.md 处女')).toEqual([]);
    });

    it('does not flag ordinary words', () => {
      expect(sourceRuleNames('// 参见 README.md 与 fully.md')).toEqual([]);
    });
  });

  it('does not flag clean comments or identifiers', () => {
    expect(sourceRuleNames('// L0-L3 AI 分级')).toEqual([]);
    expect(sourceRuleNames('const T1 = 1; const O2 = 2;')).toEqual([]);
  });
});

describe('isSourceScanTarget · 源码扫描范围', () => {
  it.each([
    'game/packages/client/src/App.tsx',
    'game/packages/shared/src/types.ts',
    'game/packages/game-engine/src/foo.test.ts',
    'game/packages/client/src/components/Foo.test.tsx',
    'game/packages/client/src/index.css',
    'game/packages/server/src/infra/logger.ts',
    'game/packages/e2e/tests/landing.spec.ts',
    'game/packages/e2e/playwright.config.ts',
    'game/packages/e2e/tests-online/online-match.spec.ts',
    'game/packages/client/index.html',
    'game/packages/client/vite.config.ts',
    'game/packages/client/package.json',
    'game/packages/server/tsconfig.json',
    'game/packages/client/scripts/other-tool.ts',
    'game/scripts/copyright-check.ts',
    'game/scripts/dev.sh',
    'game/deploy/prod/api/Dockerfile',
    'game/deploy/prod/client/nginx.conf',
    'game/deploy/prod/docker-compose.prod.yml',
    'game/deploy/dev/docker-compose.dev.yml',
    '.github/workflows/ci.yml',
    '.github/dependabot.yml',
  ])('includes %s', (p) => {
    expect(isSourceScanTarget(p)).toBe(true);
  });

  it.each([
    'game/packages/shared/src/generated/cards.ts',
    'game/packages/server/src/generated/prisma/client.ts',
    'game/packages/game-engine/src/engine/__snapshots__/x.snap',
    'game/packages/game-engine/src/__snapshots__/x.test.ts.snap',
    'game/packages/shared/src/copyrightCheck/rules.ts',
    'game/packages/shared/src/copyrightCheck/rules.test.ts',
    // 以内部素材目录为输入的脚本：代码里必须写出那个路径
    'game/scripts/sync-card-assets.ts',
    'game/packages/client/scripts/sync-assets.ts',
    'game/packages/shared/scripts/codegen.ts',
    'docs/manual/x.md',
    'docs/_internal/design/00-overview.md',
    'README.md',
    'CLAUDE.md',
    'CLAUDE.local.md',
    'experimental_demo/foo/src/index.ts',
    'game/packages/client/node_modules/foo/index.js',
    'game/packages/client/dist/main.js',
    'game/packages/client/public/cards/manifest.json',
    'game/packages/client/public/dice/dice-red-1.svg',
    'game/packages/client/public/sfx/README.md',
    'game/pnpm-lock.yaml',
    'game/packages/client/tsconfig.tsbuildinfo',
    'game/.env.example',
    'game/packages/e2e/playwright-report/index.html',
    'game/packages/e2e/test-results/a/trace.json',
    'game/packages/client/src/assets/logo.png',
    'game/packages/client/src/assets/font.woff2',
    'image.png',
  ])('excludes %s', (p) => {
    expect(isSourceScanTarget(p)).toBe(false);
  });

  it('overlaps isScanTarget only on i18n locales (copyright-check.ts prefers isScanTarget)', () => {
    const p = 'game/packages/client/src/i18n/locales/zh-CN.json';
    expect(isScanTarget(p) && isSourceScanTarget(p)).toBe(true);
    expect(isScanTarget('README.md') && isSourceScanTarget('README.md')).toBe(false);
    expect(isScanTarget('docs/manual/01-game-overview.md')).toBe(true);
    expect(isSourceScanTarget('docs/manual/01-game-overview.md')).toBe(false);
  });
});
