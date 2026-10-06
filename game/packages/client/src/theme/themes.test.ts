import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_IDS,
  THEME_STORAGE_KEY,
  TOKEN_NAMES,
  getTheme,
  isThemeId,
  resolveThemeId,
  tokenVar,
} from './themes';

describe('主题表', () => {
  it('令牌名为 18 个且顺序固定', () => {
    expect(TOKEN_NAMES).toEqual([
      'bg',
      'panel',
      'panel2',
      'ink',
      'dim',
      'faint',
      'line',
      'line2',
      'acc',
      'accb',
      'accsoft',
      'lock',
      'blood',
      'ok',
      'grade',
      'serif',
      'sans',
      'mono',
    ]);
  });

  it('tokenVar 返回 --ms- 前缀的变量名', () => {
    expect(tokenVar('bg')).toBe('--ms-bg');
    expect(tokenVar('accsoft')).toBe('--ms-accsoft');
  });

  it('每个主题都带齐 18 个非空令牌，且 id / 明暗 / 主题色合法', () => {
    for (const id of THEME_IDS) {
      const theme = THEMES[id];
      expect(theme.id).toBe(id);
      expect(['dark', 'light']).toContain(theme.scheme);
      expect(theme.themeColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(theme.nameKey).toBe(`theme.names.${id}`);
      for (const name of TOKEN_NAMES) {
        expect(theme.tokens[name], `${id}.${name}`).toBeTruthy();
      }
      expect(Object.keys(theme.tokens).sort()).toEqual([...TOKEN_NAMES].sort());
    }
  });

  it('noir 是暗色主题，取值与约定一致', () => {
    const noir = getTheme('noir');
    expect(noir.scheme).toBe('dark');
    expect(noir.themeColor).toBe('#0A0D13');
    expect(noir.tokens.bg).toBe('#0A0D13');
    expect(noir.tokens.acc).toBe('#C9A35F');
    expect(noir.tokens.line2).toBe('rgba(233,228,214,.22)');
    expect(noir.tokens.serif).toBe(
      "'Noto Serif SC Variable','Noto Serif SC','Songti SC','STSong',serif",
    );
  });

  it('blueprint 是暗色主题，取值与约定一致', () => {
    const bp = getTheme('blueprint');
    expect(bp.scheme).toBe('dark');
    expect(bp.themeColor).toBe('#0B1624');
    expect(bp.tokens.bg).toBe('#0B1624');
    expect(bp.tokens.panel).toBe('#0F1E30');
    expect(bp.tokens.ink).toBe('#D7E3EF');
    expect(bp.tokens.acc).toBe('#C9A35F');
    expect(bp.tokens.lock).toBe('#7FB4D9');
    expect(bp.tokens.line2).toBe('rgba(186,214,236,.34)');
  });

  it('totem 是暗色主题，取值与约定一致', () => {
    const totem = getTheme('totem');
    expect(totem.scheme).toBe('dark');
    expect(totem.themeColor).toBe('#0B0F16');
    expect(totem.tokens.bg).toBe('#0B0F16');
    expect(totem.tokens.panel).toBe('#10161F');
    expect(totem.tokens.ink).toBe('#DCE5F0');
    expect(totem.tokens.acc).toBe('#C9A35F');
    expect(totem.tokens.accb).toBe('#E8CC8E');
    expect(totem.tokens.lock).toBe('#7FB4D9');
    expect(totem.tokens.line2).toBe('rgba(200,215,235,.24)');
  });

  it('matrix 是暗色主题，取值与约定一致：近黑的绿底、磷光绿强调色、等宽字体为主', () => {
    const matrix = getTheme('matrix');
    expect(matrix.scheme).toBe('dark');
    expect(matrix.themeColor).toBe('#040805');
    expect(matrix.tokens.bg).toBe('#040805');
    expect(matrix.tokens.panel).toBe('#081009');
    expect(matrix.tokens.ink).toBe('#C6E3CF');
    expect(matrix.tokens.acc).toBe('#45E07E');
    expect(matrix.tokens.accb).toBe('#9FFFB9');
    expect(matrix.tokens.line2).toBe('rgba(69,224,126,.4)');
    // 正文与标题都以等宽字体打头，中文回落到已有的黑体栈；不引入新的字体依赖
    for (const k of ['serif', 'sans', 'mono'] as const) {
      expect(matrix.tokens[k].startsWith("'IBM Plex Mono'"), k).toBe(true);
    }
    expect(matrix.tokens.sans).toContain("'Noto Sans SC Variable'");
  });

  it('各主题的令牌取值互不相同（换主题必须看得出来）', () => {
    const all = THEME_IDS.map((id) => getTheme(id).tokens);
    for (const k of ['bg', 'panel', 'ink', 'line2'] as const) {
      expect(new Set(all.map((tokens) => tokens[k])).size, k).toBe(all.length);
    }
  });

  it('默认主题与存储键', () => {
    expect(DEFAULT_THEME_ID).toBe('noir');
    expect(THEME_IDS).toContain(DEFAULT_THEME_ID);
    expect(THEME_STORAGE_KEY).toBe('icgame-theme');
  });
});

describe('isThemeId / resolveThemeId', () => {
  it('认得主题 id', () => {
    expect(isThemeId('noir')).toBe(true);
    expect(isThemeId('blueprint')).toBe(true);
    expect(isThemeId('totem')).toBe(true);
    expect(isThemeId('matrix')).toBe(true);
  });

  it('不认旧值、空值与原型链上的名字', () => {
    for (const v of ['light', 'dark', 'system', '', null, undefined, 1, {}, 'toString']) {
      expect(isThemeId(v)).toBe(false);
    }
  });

  it('不认识的值回落到默认主题', () => {
    expect(resolveThemeId('noir')).toBe('noir');
    expect(resolveThemeId('blueprint')).toBe('blueprint');
    expect(resolveThemeId('totem')).toBe('totem');
    expect(resolveThemeId('matrix')).toBe('matrix');
    for (const v of ['light', 'dark', 'system', null, undefined, 42]) {
      expect(resolveThemeId(v)).toBe(DEFAULT_THEME_ID);
    }
  });
});
