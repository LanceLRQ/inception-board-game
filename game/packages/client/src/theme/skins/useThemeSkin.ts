// 读当前主题并返回它的皮肤

import { useThemeStore } from '../../stores/useThemeStore';
import { getSkin } from './index';
import type { ThemeSkin } from './types';

export function useThemeSkin(): ThemeSkin {
  const themeId = useThemeStore((s) => s.themeId);
  return getSkin(themeId);
}
