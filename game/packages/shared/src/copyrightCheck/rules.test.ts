import { describe, it, expect } from 'vitest';
import { checkLine, scanText, isScanTarget, summarize, INTERNAL_TERM_RULES } from './rules.js';

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
  });

  it('includes i18n locales json', () => {
    expect(isScanTarget('game/packages/client/src/i18n/locales/zh-CN.json')).toBe(true);
    expect(isScanTarget('game/packages/client/src/i18n/locales/en-US.json')).toBe(true);
  });

  it('excludes source code (source comments allowed to reference design docs)', () => {
    expect(isScanTarget('game/packages/client/src/App.tsx')).toBe(false);
    expect(isScanTarget('game/packages/shared/src/types.ts')).toBe(false);
  });

  it('excludes test files', () => {
    expect(isScanTarget('game/packages/game-engine/src/foo.test.ts')).toBe(false);
  });

  it('excludes plans/ directory', () => {
    expect(isScanTarget('plans/design/00-overview.md')).toBe(false);
    expect(isScanTarget('plans/tasks.md')).toBe(false);
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
