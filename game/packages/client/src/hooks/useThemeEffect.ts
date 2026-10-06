// useThemeEffect - 把当前主题同步到 <html> 的 data-theme / data-scheme 与 theme-color meta

import { useEffect } from 'react';
import { getTheme, type ThemeDefinition } from '../theme/themes';
import { useThemeStore } from '../stores/useThemeStore';

/** applyTheme 用到的最小 document 形状，便于在没有 DOM 的测试环境里传入替身 */
export interface ThemeDocument {
  readonly documentElement: { setAttribute(name: string, value: string): void };
  querySelector(selector: string): { setAttribute(name: string, value: string): void } | null;
}

/** 把主题落到根元素：设置主题 id 与明暗属性，并更新 theme-color meta */
export function applyTheme(
  theme: ThemeDefinition,
  doc: ThemeDocument | undefined = typeof document === 'undefined' ? undefined : document,
): void {
  if (!doc) return;
  doc.documentElement.setAttribute('data-theme', theme.id);
  doc.documentElement.setAttribute('data-scheme', theme.scheme);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.themeColor);
}

export function useThemeEffect(): void {
  const themeId = useThemeStore((s) => s.themeId);

  useEffect(() => {
    applyTheme(getTheme(themeId));
  }, [themeId]);
}
