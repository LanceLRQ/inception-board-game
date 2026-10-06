import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from '@/lib/utils';

/**
 * 开关：根元素本身就是 44×44 的触控区，里面画 40×24 的滑轨与圆钮。
 * 状态靠圆钮位置与滑轨填充双重表达；键盘可聚焦，Space / Enter 切换（Base UI 提供）。
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'group/switch inline-flex size-11 shrink-0 items-center justify-center rounded-lg select-none',
        'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        data-slot="switch-track"
        className={cn(
          'flex h-6 w-10 items-center rounded-full border border-input bg-muted p-0.5 transition-colors',
          'group-data-checked/switch:border-primary group-data-checked/switch:bg-primary',
        )}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            'block size-4.5 rounded-full bg-muted-foreground shadow-sm transition-transform',
            'data-checked:translate-x-4 data-checked:bg-primary-foreground',
          )}
        />
      </span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
