// 主题偏好 Zustand store（带 localStorage 持久化）

import { create } from 'zustand';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  isValidThemePreference,
  type ThemePreference,
} from '../lib/theme';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

/** 启动时从 localStorage 读取（SSR/Jest 环境安全） */
function loadInitial(): ThemePreference {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_PREFERENCE;
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return isValidThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: loadInitial(),
  setPreference: (pref) => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, pref);
      } catch {
        // 忽略 storage 写入失败（例如隐私模式）
      }
    }
    set({ preference: pref });
  },
}));
