// Dialog 统一外壳 · 基于 @base-ui/react Dialog primitive + Tailwind 过渡动画
// 对照：plans/2-1-3-1-2-ui-cozy-wave.md Dialog 视觉规范
//
// 用法：
//   <Dialog open={open} onOpenChange={setOpen} blocking={false} size="md">
//     <DialogHeader>
//       <DialogTitle>标题</DialogTitle>
//       <DialogDescription>副标题/说明</DialogDescription>
//     </DialogHeader>
//     <DialogBody>内容</DialogBody>
//     <DialogFooter>
//       <button onClick={...}>确认</button>
//     </DialogFooter>
//   </Dialog>
//
// blocking=true（默认）：不可点背景关闭 / 禁用 ESC — 用于"必须响应的阻塞响应窗口"
// blocking=false：点背景或 ESC 即关闭 — 用于"仅 ack 的展示类弹窗"

import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DialogSize = 'sm' | 'md' | 'lg';

export interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** true=禁止点背景关闭 + 禁用 ESC；默认 true */
  blocking?: boolean;
  size?: DialogSize;
  /** 是否渲染右上角 × 关闭按钮（blocking=true 默认不显示；blocking=false 默认显示） */
  showClose?: boolean;
  'data-testid'?: string;
  className?: string;
  children?: React.ReactNode;
}

const sizeClass: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export function Dialog({
  open,
  onOpenChange,
  blocking = true,
  size = 'md',
  showClose,
  'data-testid': testId,
  className,
  children,
}: DialogProps) {
  const effectiveShowClose = showClose ?? !blocking;

  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
      modal
      // blocking=true → 禁止点背景关闭
      disablePointerDismissal={blocking}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          className={cn(
            'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm',
            'transition-opacity duration-200',
            'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
          )}
        />
        <BaseDialog.Popup
          data-testid={testId}
          // blocking=true 时禁用 ESC 关闭：在 keydown 捕获阶段拦截
          onKeyDown={(e) => {
            if (blocking && e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto',
            'rounded-xl border border-border bg-card text-card-foreground shadow-2xl',
            'p-5',
            'transition-all duration-200',
            'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
            'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
            sizeClass[size],
            className,
          )}
        >
          {effectiveShowClose && (
            <BaseDialog.Close
              className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="关闭"
              data-testid={testId ? `${testId}-close` : undefined}
            >
              <X className="h-4 w-4" />
            </BaseDialog.Close>
          )}
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

// ---- 语义化子组件 ----

export function DialogHeader({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return <div className={cn('mb-3 flex flex-col gap-1 pr-6', className)}>{children}</div>;
}

export function DialogTitle({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <BaseDialog.Title className={cn('text-base font-semibold leading-tight', className)}>
      {children}
    </BaseDialog.Title>
  );
}

export function DialogDescription({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <BaseDialog.Description className={cn('text-xs text-muted-foreground', className)}>
      {children}
    </BaseDialog.Description>
  );
}

export function DialogBody({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return <div className={cn('space-y-3 text-sm', className)}>{children}</div>;
}

export function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('mt-4 flex flex-wrap items-center justify-end gap-2', className)}>
      {children}
    </div>
  );
}
