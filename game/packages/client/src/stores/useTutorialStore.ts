// 教学进度 Zustand store（localStorage 持久化）
// 对照：plans/tasks.md W8.5-9 · 新手教学关卡

import { create } from 'zustand';
import {
  advance,
  initialProgress,
  type TutorialEvent,
  type TutorialProgress,
  type TutorialScenario,
} from '@icgame/shared';

export const TUTORIAL_STORAGE_KEY = 'ico:tutorial:progress';

/** 纯函数：解析 localStorage（便于测试） */
export function parseStoredProgress(raw: string | null): TutorialProgress | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TutorialProgress;
    if (typeof parsed.scenarioId !== 'string') return null;
    if (typeof parsed.currentStepIndex !== 'number') return null;
    if (!Array.isArray(parsed.completedStepIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadProgress(): TutorialProgress | null {
  if (typeof localStorage === 'undefined') return null;
  return parseStoredProgress(localStorage.getItem(TUTORIAL_STORAGE_KEY));
}

function persistProgress(p: TutorialProgress | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (p) localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(p));
    else localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    /* 隐私模式等 */
  }
}

interface TutorialState {
  readonly progress: TutorialProgress | null;
  start: (scenario: TutorialScenario) => void;
  dispatch: (scenario: TutorialScenario, event: TutorialEvent) => void;
  reset: () => void;
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  progress: loadProgress(),
  start: (scenario) => {
    const p = initialProgress(scenario);
    persistProgress(p);
    set({ progress: p });
  },
  dispatch: (scenario, event) => {
    const current = get().progress;
    if (!current || current.scenarioId !== scenario.id) {
      // 不在进行中或场景不匹配 → 先 start
      const fresh = initialProgress(scenario);
      const advanced = advance(scenario, fresh, event);
      persistProgress(advanced);
      set({ progress: advanced });
      return;
    }
    const advanced = advance(scenario, current, event);
    persistProgress(advanced);
    set({ progress: advanced });
  },
  reset: () => {
    persistProgress(null);
    set({ progress: null });
  },
}));
