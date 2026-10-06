// useThemeEffect - 把当前主题同步到 <html> 的 data-theme / data-scheme 与 theme-color meta

import { useEffect } from 'react';
import { loadThemeFonts } from '../theme/fonts';
import { getTheme, type ThemeDefinition } from '../theme/themes';
import { useThemeStore } from '../stores/useThemeStore';

/** applyTheme 用到的最小 document 形状，便于在没有 DOM 的测试环境里传入替身 */
export interface ThemeDocument {
  readonly documentElement: {
    setAttribute(name: string, value: string): void;
    /** 首屏脚本写下的底色与控件配色；与样式表里的令牌取值一致，替身可以不提供 */
    readonly style?: { backgroundColor: string; colorScheme: string };
  };
  querySelector(selector: string): { setAttribute(name: string, value: string): void } | null;
}

/** 把主题落到根元素：设置主题 id 与明暗属性、底色与控件配色，并更新 theme-color meta */
export function applyTheme(
  theme: ThemeDefinition,
  doc: ThemeDocument | undefined = typeof document === 'undefined' ? undefined : document,
): void {
  if (!doc) return;
  doc.documentElement.setAttribute('data-theme', theme.id);
  doc.documentElement.setAttribute('data-scheme', theme.scheme);
  const style = doc.documentElement.style;
  if (style) {
    style.backgroundColor = theme.tokens.bg;
    style.colorScheme = theme.scheme;
  }
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.themeColor);
}

export function useThemeEffect(): void {
  const themeId = useThemeStore((s) => s.themeId);

  useEffect(() => {
    applyTheme(getTheme(themeId));
    // 主题自带的字体按需加载：切到这个主题才请求，不阻塞渲染
    void loadThemeFonts(themeId);
  }, [themeId]);
}
