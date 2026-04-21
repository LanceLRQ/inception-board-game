// Toast 门面 API · 简化调用点书写
//
// 用法：
//   import { toast } from '@/lib/toast';
//   toast.info('SHOOT 命中 · 被推至 L2');
//   toast.error('SHOOT 击杀 · AI 5', { duration: 5000 });
//   toast.warn('未命中');
//   toast.success('自定义消息');

import { useToastStore, type ToastKind } from '@/stores/useToastStore';

export interface ToastOptions {
  /** 自定义时长（毫秒）；0 / null = 常驻（需手动 remove） */
  duration?: number;
  /** 自定义 id（用于后续 remove 或同 id 覆盖更新） */
  id?: string;
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  info: 3000,
  success: 3000,
  warn: 4000,
  error: 5000,
};

function push(kind: ToastKind, message: string, opts?: ToastOptions): string {
  const duration = opts?.duration ?? DEFAULT_DURATION[kind];
  return useToastStore.getState().push({
    id: opts?.id,
    kind,
    message,
    duration,
  });
}

export const toast = {
  info: (message: string, opts?: ToastOptions) => push('info', message, opts),
  success: (message: string, opts?: ToastOptions) => push('success', message, opts),
  warn: (message: string, opts?: ToastOptions) => push('warn', message, opts),
  error: (message: string, opts?: ToastOptions) => push('error', message, opts),
  remove: (id: string) => useToastStore.getState().remove(id),
  clear: () => useToastStore.getState().clear(),
};
