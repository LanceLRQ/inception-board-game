// 主题 Zustand store（带 localStorage 持久化）

import { create } from 'zustand';
import { THEME_STORAGE_KEY, resolveThemeId, type ThemeId } from '../theme/themes';

interface ThemeState {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}

/** 启动时从 localStorage 读取；旧版存的 light / dark / system 会回落到默认主题 */
function loadInitial(): ThemeId {
  try {
    if (typeof localStorage === 'undefined') return resolveThemeId(null);
    return resolveThemeId(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return resolveThemeId(null);
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeId: loadInitial(),
  setThemeId: (id) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, id);
      }
    } catch {
      // 忽略 storage 写入失败（例如隐私模式）
    }
    set({ themeId: id });
  },
}));
