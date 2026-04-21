// 全局 Toast store（zustand）
// 对照：plans/2-1-3-1-2-ui-cozy-wave.md Toast 视觉规范
//
// 用法（推荐走 lib/toast.ts 门面 API）：
//   import { toast } from '@/lib/toast';
//   toast.info('SHOOT 命中 · 被推至 L2');

import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface ToastEntry {
  id: string;
  kind: ToastKind;
  message: string;
  /** 自动消失毫秒；0 / null = 常驻不自消失 */
  duration: number;
  createdAt: number;
}

export interface ToastState {
  queue: ToastEntry[];
  /** 最多可见条目数（超出按 FIFO 挤出最早） */
  maxVisible: number;
  push: (input: Omit<ToastEntry, 'id' | 'createdAt'> & { id?: string }) => string;
  remove: (id: string) => void;
  clear: () => void;
}

let counter = 0;
const genId = (): string => {
  counter += 1;
  return `toast_${Date.now().toString(36)}_${counter}`;
};

export const DEFAULT_MAX_VISIBLE = 3;

export const useToastStore = create<ToastState>((set) => ({
  queue: [],
  maxVisible: DEFAULT_MAX_VISIBLE,

  push: (input) => {
    const id = input.id ?? genId();
    const entry: ToastEntry = {
      id,
      kind: input.kind,
      message: input.message,
      duration: input.duration,
      createdAt: Date.now(),
    };
    set((s) => {
      // 去重：若 id 已存在，直接替换（支持"同 id 更新"语义）
      const existing = s.queue.findIndex((q) => q.id === id);
      let next: ToastEntry[];
      if (existing >= 0) {
        next = [...s.queue];
        next[existing] = entry;
      } else {
        next = [...s.queue, entry];
      }
      // FIFO 截断：队列超过 maxVisible * 2 做保护（实际展示由 Toaster 层 slice）
      if (next.length > s.maxVisible * 2) {
        next = next.slice(next.length - s.maxVisible * 2);
      }
      return { queue: next };
    });
    return id;
  },

  remove: (id) =>
    set((s) => ({
      queue: s.queue.filter((q) => q.id !== id),
    })),

  clear: () => set({ queue: [] }),
}));
