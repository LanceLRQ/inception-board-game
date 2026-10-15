// 对局内的主题入口：点开浮层直接换主题（与设置页同一个选择器），不用退出对局。
// 桌面放在片头条，移动放在顶栏右侧；只是个图标按钮，触控时命中区撑到 44×44。

import { useTranslation } from 'react-i18next';
import { Palette } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ThemePicker } from '../../ThemePicker';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';

interface ThemeMenuProps {
  /** 触发按钮的附加样式（两个布局的顶栏高度不同） */
  readonly className?: string;
}

export function ThemeMenu({ className }: ThemeMenuProps) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t('theme.pick')}
        title={t('theme.pick')}
        data-testid="match-theme-toggle"
        className={cn(
          'flex shrink-0 cursor-pointer items-center justify-center text-dim hover:text-foreground coarse:min-h-11 coarse:min-w-11',
          className,
        )}
      >
        <Palette className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        data-testid="match-theme-popover"
        className="max-h-[80dvh] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <p className="px-1 text-xs text-muted-foreground">{t('theme.pick')}</p>
        <ThemePicker />
      </PopoverContent>
    </Popover>
  );
}
