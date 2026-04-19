// 音效偏好 Zustand store（volume + muted，带 localStorage 持久化）
// 对照：plans/design/06-frontend-design.md §6.19.5

import { create } from 'zustand';
import { clampVolume } from '../lib/audio.js';

export const AUDIO_STORAGE_KEY = 'ico:audio:prefs';
export const DEFAULT_VOLUME = 0.7;
export const DEFAULT_MUTED = false;

interface AudioPrefs {
  readonly volume: number;
  readonly muted: boolean;
}

interface AudioState {
  readonly volume: number;
  readonly muted: boolean;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  toggleMuted: () => void;
}

/** 纯函数：解析 localStorage 中的偏好（便于测试） */
export function parsePrefs(raw: string | null): AudioPrefs {
  if (!raw) return { volume: DEFAULT_VOLUME, muted: DEFAULT_MUTED };
  try {
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    return {
      volume: typeof parsed.volume === 'number' ? clampVolume(parsed.volume) : DEFAULT_VOLUME,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_MUTED,
    };
  } catch {
    return { volume: DEFAULT_VOLUME, muted: DEFAULT_MUTED };
  }
}

function loadInitial(): AudioPrefs {
  if (typeof localStorage === 'undefined') return { volume: DEFAULT_VOLUME, muted: DEFAULT_MUTED };
  return parsePrefs(localStorage.getItem(AUDIO_STORAGE_KEY));
}

function save(prefs: AudioPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 隐私模式等
  }
}

export const useAudioStore = create<AudioState>((set, get) => {
  const initial = loadInitial();
  return {
    volume: initial.volume,
    muted: initial.muted,
    setVolume: (v: number) => {
      const clamped = clampVolume(v);
      save({ volume: clamped, muted: get().muted });
      set({ volume: clamped });
    },
    setMuted: (m: boolean) => {
      save({ volume: get().volume, muted: m });
      set({ muted: m });
    },
    toggleMuted: () => {
      const next = !get().muted;
      save({ volume: get().volume, muted: next });
      set({ muted: next });
    },
  };
});
