// 主题解析纯函数
// 对照：plans/design/06-frontend-design.md 明暗双主题
//
// 三态：
//   - 'light' / 'dark'：显式选择
//   - 'system'：跟随系统（prefers-color-scheme）
//
// 解析结果始终是 'light' | 'dark'（用于 document.documentElement.classList）

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'icgame-theme';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

/** 把三态 preference + 系统偏好 解析为二态 resolvedTheme */
export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/** 校验 localStorage 读出来的值是否是合法 ThemePreference */
export function isValidThemePreference(v: unknown): v is ThemePreference {
  return v === 'light' || v === 'dark' || v === 'system';
}

/** 三态循环切换：light → dark → system → light */
export function cycleTheme(current: ThemePreference): ThemePreference {
  switch (current) {
    case 'light':
      return 'dark';
    case 'dark':
      return 'system';
    case 'system':
      return 'light';
  }
}
