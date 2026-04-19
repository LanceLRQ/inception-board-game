// ThemeToggle - 三态主题切换按钮
// 对照：plans/design/06-frontend-design.md 明暗双主题

import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../stores/useThemeStore';
import { cycleTheme } from '../../lib/theme';
import { cn } from '../../lib/utils';

const ICONS: Record<'light' | 'dark' | 'system', string> = {
  light: '☀️',
  dark: '🌙',
  system: '🖥️',
};

export interface ThemeToggleProps {
  readonly className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { t } = useTranslation();
  const pref = useThemeStore((s) => s.preference);
  const setPref = useThemeStore((s) => s.setPreference);

  const label = t(`theme.${pref}`, {
    defaultValue: pref === 'light' ? '浅色' : pref === 'dark' ? '深色' : '跟随系统',
  });

  return (
    <button
      type="button"
      onClick={() => setPref(cycleTheme(pref))}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm shadow-sm transition-colors',
        'hover:bg-accent hover:text-accent-foreground active:scale-95',
        className,
      )}
      aria-label={t('theme.toggle', { defaultValue: '切换主题' })}
      title={t('theme.toggle_hint', {
        defaultValue: '点击循环：浅色 → 深色 → 跟随系统',
      })}
    >
      <span aria-hidden="true">{ICONS[pref]}</span>
      <span>{label}</span>
    </button>
  );
}
