// useThemeEffect - 把当前主题同步到 <html> 的 data-theme / data-scheme 与 theme-color meta

import { useEffect } from 'react';
import { loadThemeFonts } from '../theme/fonts';
import { fxOffAttribute, motionAttribute, type EffectPrefs } from '../theme/effects';
import { getTheme, type ThemeDefinition } from '../theme/themes';
import { useEffectsStore } from '../stores/useEffectsStore';
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

/** applyEffects 用到的最小 document 形状 */
export interface EffectsDocument {
  readonly documentElement: {
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
  };
}

/**
 * 把效果偏好落到根元素：data-fx-off（空格分隔的内部名字，没有关闭项时移除）
 * 与 data-motion（总是减少 → reduced，不减少 → full，跟随系统 → 移除，交给媒体查询）
 */
export function applyEffects(
  prefs: EffectPrefs,
  doc: EffectsDocument | undefined = typeof document === 'undefined' ? undefined : document,
): void {
  if (!doc) return;
  const root = doc.documentElement;
  const fxOff = fxOffAttribute(prefs);
  if (fxOff) root.setAttribute('data-fx-off', fxOff);
  else root.removeAttribute('data-fx-off');
  const motion = motionAttribute(prefs);
  if (motion) root.setAttribute('data-motion', motion);
  else root.removeAttribute('data-motion');
}

export function useThemeEffect(): void {
  const themeId = useThemeStore((s) => s.themeId);
  const effectPrefs = useEffectsStore((s) => s.prefs);

  useEffect(() => {
    applyEffects(effectPrefs);
  }, [effectPrefs]);

  useEffect(() => {
    applyTheme(getTheme(themeId));
    // 主题自带的字体按需加载：切到这个主题才请求，不阻塞渲染
    void loadThemeFonts(themeId);
  }, [themeId]);
}
