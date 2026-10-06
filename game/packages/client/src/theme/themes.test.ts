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
  it('令牌名为 17 个且顺序固定', () => {
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

  it('每个主题都带齐 17 个非空令牌，且 id / 明暗 / 主题色合法', () => {
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
    expect(noir.tokens.serif).toBe("'Noto Serif SC','Songti SC','STSong',serif");
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
  });

  it('不认旧值、空值与原型链上的名字', () => {
    for (const v of ['light', 'dark', 'system', '', null, undefined, 1, {}, 'toString']) {
      expect(isThemeId(v)).toBe(false);
    }
  });

  it('不认识的值回落到默认主题', () => {
    expect(resolveThemeId('noir')).toBe('noir');
    for (const v of ['light', 'dark', 'system', null, undefined, 42]) {
      expect(resolveThemeId(v)).toBe(DEFAULT_THEME_ID);
    }
  });
});
