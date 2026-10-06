// ThemePicker - 主题单选组：每个主题一张小预览卡（示意图案、三段色、用该主题标题字体写的主题名）
//
// 预览卡自己用该主题的令牌上色，所以无论当前是哪个主题，五张卡都各是各的样子；
// 这里只引用字体栈而不加载字体（庄周梦蝶的楷体只有切到该主题才会请求）。

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useThemeStore } from '../../stores/useThemeStore';
import { THEMES, THEME_IDS } from '../../theme/themes';
import { cn } from '../../lib/utils';
import { MotifArt } from './MotifArt';
import { previewStripe } from './preview';

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
      className={cn('grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3', className)}
    >
      {THEME_IDS.map((id) => {
        const theme = THEMES[id];
        const checked = id === themeId;
        const [bg, panel, acc] = previewStripe(theme);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            data-testid={`theme-option-${id}`}
            onClick={() => setThemeId(id)}
            className={cn(
              'group/theme flex min-h-11 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-transform',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98]',
              checked
                ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                : 'hover:border-ring',
            )}
          >
            {/* 色块与名字直接读主题表：这里是唯一允许内联颜色的地方 */}
            <span aria-hidden="true" className="block aspect-[18/11] w-full">
              <MotifArt id={id} />
            </span>
            <span aria-hidden="true" className="flex h-1.5 w-full">
              <span className="flex-1" style={{ background: bg }} />
              <span className="flex-1" style={{ background: panel }} />
              <span className="flex-1" style={{ background: acc }} />
            </span>
            <span
              className="flex min-w-0 items-center justify-between gap-1 px-2.5 py-2 text-sm"
              style={{ background: theme.tokens.panel, color: theme.tokens.ink }}
            >
              <span
                className="min-w-0 font-semibold leading-tight break-words"
                style={{ fontFamily: theme.tokens.serif }}
              >
                {t(theme.nameKey)}
              </span>
              {checked && (
                <Check
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0"
                  style={{ color: theme.tokens.acc }}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
