// 效果偏好 Zustand store：装饰效果开关与「减少动效」三态（带 localStorage 持久化）

import { create } from 'zustand';
import {
  DEFAULT_EFFECT_PREFS,
  EFFECTS_STORAGE_KEY,
  parseEffectPrefs,
  serializeEffectPrefs,
  setEffectOn,
  setMotionPref,
  type EffectKey,
  type EffectPrefs,
  type MotionPref,
} from '../theme/effects';

interface EffectsState {
  prefs: EffectPrefs;
  setEffectOn: (key: EffectKey, on: boolean) => void;
  setMotion: (motion: MotionPref) => void;
}

/** 启动时从 localStorage 读取；读不到或内容无效就用缺省 */
function loadInitial(): EffectPrefs {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_EFFECT_PREFS;
    return parseEffectPrefs(localStorage.getItem(EFFECTS_STORAGE_KEY));
  } catch {
    return DEFAULT_EFFECT_PREFS;
  }
}

function save(prefs: EffectPrefs): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(EFFECTS_STORAGE_KEY, serializeEffectPrefs(prefs));
    }
  } catch {
    // 忽略 storage 写入失败（例如隐私模式）
  }
}

export const useEffectsStore = create<EffectsState>((set, get) => ({
  prefs: loadInitial(),
  setEffectOn: (key, on) => {
    const prefs = setEffectOn(get().prefs, key, on);
    save(prefs);
    set({ prefs });
  },
  setMotion: (motion) => {
    const prefs = setMotionPref(get().prefs, motion);
    save(prefs);
    set({ prefs });
  },
}));
