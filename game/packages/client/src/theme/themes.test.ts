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

/** 相对亮度（WCAG 2.x） */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** 两个十六进制颜色的对比度 */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** 把 rgba(r,g,b,a) 叠在十六进制底色上，得到不透明的十六进制色 */
function blend(rgba: string, ground: string): string {
  const m = rgba.match(/rgba\((\d+),(\d+),(\d+),([.\d]+)\)/);
  if (!m) throw new Error(`not rgba: ${rgba}`);
  const alpha = Number(m[4]);
  const fg = [m[1], m[2], m[3]].map(Number);
  const bg = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16));
  const out = fg.map((v, i) => Math.round(v! * alpha + bg[i]! * (1 - alpha)));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

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

  it('butterfly 是唯一的亮色主题：宣纸底、松烟墨、朱砂强调色、楷体打头的标题字体', () => {
    const b = getTheme('butterfly');
    expect(b.scheme).toBe('light');
    expect(b.themeColor).toBe('#F0EBDF');
    expect(b.tokens.bg).toBe('#F0EBDF');
    expect(b.tokens.panel).toBe('#FAF7EF');
    expect(b.tokens.ink).toBe('#26221B');
    expect(b.tokens.acc).toBe('#98322A');
    expect(b.tokens.lock).toBe('#3D6570');
    expect(b.tokens.serif.startsWith("'LXGW WenKai Screen'")).toBe(true);
    // 小字的正文字体不用楷体，沿用已有的黑体栈
    expect(b.tokens.sans.startsWith("'Noto Sans SC Variable'")).toBe(true);
    expect(THEME_IDS.filter((id) => getTheme(id).scheme === 'light')).toEqual(['butterfly']);
  });

  it('butterfly 的文字色在各个底色上都过 WCAG 对比度：正文 ≥ 4.5，强调与图标色 ≥ 4.5（按文字用）', () => {
    const t = getTheme('butterfly').tokens;
    const grounds = [t.bg, t.panel, t.panel2];
    for (const name of ['ink', 'dim', 'faint', 'acc', 'accb', 'lock', 'ok', 'blood'] as const) {
      for (const ground of grounds) {
        expect(contrast(t[name], ground), `${name} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // 主按钮：纸色字压在朱砂底上
    expect(contrast(t.panel, t.acc)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.bg, t.accb)).toBeGreaterThanOrEqual(4.5);
  });

  it('butterfly 的输入框描边（line2）压在纸色上 ≥ 3:1', () => {
    const t = getTheme('butterfly').tokens;
    for (const ground of [t.bg, t.panel]) {
      expect(contrast(blend(t.line2, ground), ground)).toBeGreaterThanOrEqual(3);
    }
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
    expect(isThemeId('butterfly')).toBe(true);
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
    expect(resolveThemeId('butterfly')).toBe('butterfly');
    for (const v of ['light', 'dark', 'system', null, undefined, 42]) {
      expect(resolveThemeId(v)).toBe(DEFAULT_THEME_ID);
    }
  });
});
