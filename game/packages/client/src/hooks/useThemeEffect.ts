// useThemeEffect - 同步主题偏好到 document.documentElement.classList + 监听系统偏好变化
// 对照：plans/design/06-frontend-design.md 明暗双主题 follow 系统

import { useEffect } from 'react';
import { resolveTheme, type ResolvedTheme } from '../lib/theme';
import { useThemeStore } from '../stores/useThemeStore';

/** 应用 resolved 主题到 HTML 根元素（`.dark` class） */
export function applyThemeClass(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.setAttribute('data-theme', resolved);
}

export function useThemeEffect(): void {
  const preference = useThemeStore((s) => s.preference);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const sync = () => {
      const resolved = resolveTheme(preference, media.matches);
      applyThemeClass(resolved);
    };

    sync();

    // 仅在 preference === 'system' 时才关心系统偏好变化
    if (preference === 'system') {
      const onChange = () => sync();
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
  }, [preference]);
}
