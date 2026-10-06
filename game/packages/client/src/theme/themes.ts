// 主题表：主题 id、明暗属性与 18 个语义令牌的取值
//
// 样式表（src/styles/index.css）里的 `[data-theme='<id>']` 规则块与这里逐字一致，
// 由 themeCss.test.ts 保证；首屏脚本（bootScript.ts）也由这张表生成。

/** 令牌名，顺序固定。对应 CSS 变量 `--ms-<name>` */
export const TOKEN_NAMES = [
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
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];

/** 令牌对应的 CSS 变量名，例如 `bg` → `--ms-bg` */
export function tokenVar(name: TokenName): string {
  return `--ms-${name}`;
}

export type ThemeScheme = 'dark' | 'light';

export interface ThemeDefinition {
  readonly id: string;
  /** 主题名的 i18n 键 */
  readonly nameKey: string;
  readonly scheme: ThemeScheme;
  /** 写入 `<meta name="theme-color">` 的十六进制色 */
  readonly themeColor: string;
  readonly tokens: Readonly<Record<TokenName, string>>;
}

export const THEMES = {
  noir: {
    id: 'noir',
    nameKey: 'theme.names.noir',
    scheme: 'dark',
    themeColor: '#0A0D13',
    tokens: {
      bg: '#0A0D13',
      panel: '#10141D',
      panel2: '#151A26',
      ink: '#E9E4D6',
      dim: '#9AA0B0',
      faint: '#5E6474',
      line: 'rgba(233,228,214,.09)',
      line2: 'rgba(233,228,214,.22)',
      acc: '#C9A35F',
      accb: '#E4C383',
      accsoft: 'rgba(201,163,95,.13)',
      lock: '#6FA8DC',
      blood: '#A8443A',
      ok: '#7FA97F',
      grade: '#C9A35F',
      serif: "'Noto Serif SC Variable','Noto Serif SC','Songti SC','STSong',serif",
      sans: "'Noto Sans SC Variable','Noto Sans SC','PingFang SC',sans-serif",
      mono: "'IBM Plex Mono','SF Mono',monospace",
    },
  },
  blueprint: {
    id: 'blueprint',
    nameKey: 'theme.names.blueprint',
    scheme: 'dark',
    themeColor: '#0B1624',
    tokens: {
      bg: '#0B1624',
      panel: '#0F1E30',
      panel2: '#13263B',
      ink: '#D7E3EF',
      dim: '#8FA6BC',
      faint: '#5C7089',
      line: 'rgba(186,214,236,.13)',
      line2: 'rgba(186,214,236,.34)',
      acc: '#C9A35F',
      accb: '#E6C684',
      accsoft: 'rgba(201,163,95,.14)',
      lock: '#7FB4D9',
      blood: '#C4685A',
      ok: '#7DB596',
      grade: '#C9A35F',
      serif: "'Noto Serif SC Variable','Noto Serif SC','Songti SC','STSong',serif",
      sans: "'Noto Sans SC Variable','Noto Sans SC','PingFang SC',sans-serif",
      mono: "'IBM Plex Mono','SF Mono',monospace",
    },
  },
  totem: {
    id: 'totem',
    nameKey: 'theme.names.totem',
    scheme: 'dark',
    themeColor: '#0B0F16',
    tokens: {
      bg: '#0B0F16',
      panel: '#10161F',
      panel2: '#141B26',
      ink: '#DCE5F0',
      dim: '#8B99AE',
      faint: '#57647A',
      line: 'rgba(200,215,235,.08)',
      line2: 'rgba(200,215,235,.24)',
      acc: '#C9A35F',
      accb: '#E8CC8E',
      accsoft: 'rgba(201,163,95,.13)',
      lock: '#7FB4D9',
      blood: '#C4685A',
      ok: '#7DA58E',
      grade: '#C9A35F',
      serif: "'Noto Serif SC Variable','Noto Serif SC','Songti SC','STSong',serif",
      sans: "'Noto Sans SC Variable','Noto Sans SC','PingFang SC',sans-serif",
      mono: "'IBM Plex Mono','SF Mono',monospace",
    },
  },
  matrix: {
    id: 'matrix',
    nameKey: 'theme.names.matrix',
    scheme: 'dark',
    themeColor: '#040805',
    tokens: {
      bg: '#040805',
      panel: '#081009',
      panel2: '#0C150E',
      ink: '#C6E3CF',
      dim: '#5FB67F',
      faint: '#5A8769',
      line: 'rgba(69,224,126,.14)',
      line2: 'rgba(69,224,126,.4)',
      acc: '#45E07E',
      accb: '#9FFFB9',
      accsoft: 'rgba(69,224,126,.1)',
      lock: '#3CC47F',
      blood: '#C4685A',
      ok: '#8BD9A5',
      grade: '#45E07E',
      serif: "'IBM Plex Mono','Noto Sans SC Variable','Noto Sans SC','PingFang SC',monospace",
      sans: "'IBM Plex Mono','Noto Sans SC Variable','Noto Sans SC','PingFang SC',monospace",
      mono: "'IBM Plex Mono','SF Mono',monospace",
    },
  },
} as const satisfies Record<string, ThemeDefinition>;

export type ThemeId = keyof typeof THEMES;

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const DEFAULT_THEME_ID: ThemeId = 'noir';

/** localStorage 键名（沿用旧键） */
export const THEME_STORAGE_KEY = 'icgame-theme';

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(THEMES, v);
}

/** 不认识的值（含旧版的 'light' / 'dark' / 'system'）一律回落到默认主题 */
export function resolveThemeId(raw: unknown): ThemeId {
  return isThemeId(raw) ? raw : DEFAULT_THEME_ID;
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEMES[id];
}
