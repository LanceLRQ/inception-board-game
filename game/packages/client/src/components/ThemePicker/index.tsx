// ThemePicker - 主题单选组：每个主题一项，带两色小色块

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useThemeStore } from '../../stores/useThemeStore';
import { THEMES, THEME_IDS } from '../../theme/themes';
import { cn } from '../../lib/utils';

export interface ThemePickerProps {
  readonly className?: string;
}

export function ThemePicker({ className }: ThemePickerProps) {
  const { t } = useTranslation();
  const themeId = useThemeStore((s) => s.themeId);
  const setThemeId = useThemeStore((s) => s.setThemeId);

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.pick')}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {THEME_IDS.map((id) => {
        const theme = THEMES[id];
        const checked = id === themeId;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => setThemeId(id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground shadow-sm transition-colors',
              'hover:bg-accent hover:text-accent-foreground active:scale-95',
              checked && 'ring-2 ring-ring',
            )}
          >
            {/* 色块直接读主题表：这里是唯一允许内联颜色的地方 */}
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-border"
              style={{
                background: `linear-gradient(135deg, ${theme.tokens.bg} 50%, ${theme.tokens.acc} 50%)`,
              }}
            />
            <span>{t(theme.nameKey)}</span>
            {checked && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
