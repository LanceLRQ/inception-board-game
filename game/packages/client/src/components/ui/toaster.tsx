// Toaster · 全局 toast 渲染容器
// 对照：plans/2-1-3-1-2-ui-cozy-wave.md Toast 视觉规范
//
// 使用：在 App.tsx / main.tsx 顶层挂载一次 <Toaster />

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore, type ToastEntry, type ToastKind } from '@/stores/useToastStore';

const KIND_ICON = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
} satisfies Record<ToastKind, typeof Info>;

const KIND_COLOR: Record<ToastKind, string> = {
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100',
  error: 'border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100',
};

const KIND_ICON_COLOR: Record<ToastKind, string> = {
  info: 'text-sky-500',
  success: 'text-emerald-500',
  warn: 'text-amber-500',
  error: 'text-rose-500',
};

function ToastCard({ entry }: { entry: ToastEntry }) {
  const remove = useToastStore((s) => s.remove);
  const Icon = KIND_ICON[entry.kind];

  useEffect(() => {
    if (!entry.duration || entry.duration <= 0) return;
    const timer = setTimeout(() => remove(entry.id), entry.duration);
    return () => clearTimeout(timer);
  }, [entry.id, entry.duration, remove]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      role="status"
      aria-live="polite"
      data-testid={`toast-${entry.kind}`}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur-sm',
        KIND_COLOR[entry.kind],
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', KIND_ICON_COLOR[entry.kind])} aria-hidden />
      <div className="flex-1 whitespace-pre-wrap leading-relaxed">{entry.message}</div>
      <button
        type="button"
        onClick={() => remove(entry.id)}
        aria-label="关闭通知"
        className="shrink-0 rounded-full p-0.5 text-muted-foreground opacity-60 hover:bg-foreground/10 hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

/**
 * Toaster · 全局 toast 渲染容器
 *   展示最近 maxVisible 条（默认 3）；超出保留在 store，下一条消失后自动替补
 *   定位：桌面右下角；移动端底部（留出可能的操作区间距）
 */
export function Toaster() {
  const { queue, maxVisible } = useToastStore();
  const visible = queue.slice(-maxVisible);

  return (
    <div
      aria-label="通知区"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(320px,calc(100vw-2rem))] flex-col-reverse gap-2"
      data-testid="toaster"
    >
      <AnimatePresence initial={false}>
        {visible.map((entry) => (
          <ToastCard key={entry.id} entry={entry} />
        ))}
      </AnimatePresence>
    </div>
  );
}
