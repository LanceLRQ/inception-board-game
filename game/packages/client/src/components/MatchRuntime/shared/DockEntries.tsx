// 底部坞的操作入口：复活 / 复活同伴 / 梦主的移动（桌面与移动两个布局共用）
// 此刻用不了的入口仍显示：aria-disabled + 变暗 + 禁用图标，点按时把原因用提示说出来（不是悄悄没反应）。
// 样式钩子类名：ms-btn（桌面）；移动端命中区不小于 44px。

import { useTranslation } from 'react-i18next';
import { Ban } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { toast } from '@/lib/toast';
import type { DockEntry } from '../controllerTypes';
import { entryTestId } from '../model/dockEntries';

interface DockEntriesProps {
  readonly entries: readonly DockEntry[];
  readonly variant: 'desktop' | 'mobile';
  readonly className?: string;
}

export function DockEntries({ entries, variant, className }: DockEntriesProps) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t('entries.aria')}
      data-testid="dock-entries"
      className={cn('flex gap-1.5', className)}
    >
      {entries.map((entry) => {
        const label = t(`entries.kind.${entry.kind}`);
        const reason = entry.reason ? t(entry.reason.key, entry.reason.params) : null;
        return (
          <button
            key={entry.kind}
            type="button"
            aria-disabled={!entry.enabled || undefined}
            aria-label={reason ? t('entries.disabledAria', { name: label, reason }) : label}
            title={reason ?? undefined}
            data-testid={entryTestId(entry.kind)}
            data-kind={entry.kind}
            data-variant={variant === 'desktop' && entry.enabled ? 'primary' : undefined}
            onClick={() => {
              if (entry.enabled) entry.open();
              else if (reason) toast.info(reason);
            }}
            className={cn(
              'flex min-w-0 flex-auto items-center justify-center gap-1 whitespace-nowrap',
              variant === 'desktop'
                ? 'ms-btn min-h-8 px-1 text-[11px] tracking-[.04em]'
                : cn(
                    'min-h-11 min-w-11 touch-manipulation border px-3 text-[11.5px] tracking-[.08em] active:translate-y-px tablet:min-h-12 tablet:text-sm',
                    entry.enabled
                      ? 'border-acc bg-acc-soft font-semibold text-acc-bright'
                      : 'cursor-not-allowed border-line-strong bg-transparent text-faint opacity-60',
                  ),
            )}
          >
            {!entry.enabled && <Ban className="size-3 shrink-0" aria-hidden />}
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
