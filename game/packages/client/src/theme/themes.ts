// 主题表：主题 id、明暗属性与 17 个语义令牌的取值
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
      grade: '#C9A35F',
      serif: "'Noto Serif SC','Songti SC','STSong',serif",
      sans: "'Noto Sans SC','PingFang SC',sans-serif",
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
