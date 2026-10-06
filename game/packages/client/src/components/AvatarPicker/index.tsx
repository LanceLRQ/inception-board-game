// AvatarPicker - 头像预览 + 「换一个」
//
// 点「换一个」就摇一个新种子并保存到账号；保存成功后才换图，失败时留在原头像并提示。
// 样式只用语义令牌；按钮高度不小于 44px。

import { useTranslation } from 'react-i18next';
import { Dices } from 'lucide-react';
import { PixelAvatar } from '../PixelAvatar';
import { cn } from '../../lib/utils';

export interface AvatarPickerProps {
  readonly seed: string;
  readonly onRoll: () => void | Promise<void>;
  /** 保存中：按钮禁用 */
  readonly rolling?: boolean;
  /** 上一次保存失败：显示提示 */
  readonly failed?: boolean;
  /** 头像预览边长（默认 64） */
  readonly size?: number;
  readonly className?: string;
  readonly testId?: string;
}

export function AvatarPicker({
  seed,
  onRoll,
  rolling = false,
  failed = false,
  size = 64,
  className,
  testId = 'avatar-picker',
}: AvatarPickerProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex items-center gap-3', className)} data-testid={testId}>
      <PixelAvatar seed={seed} size={size} ariaLabel={t('avatar.current')} />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => void onRoll()}
          disabled={rolling}
          aria-label={t('avatar.roll')}
          data-testid={`${testId}-roll`}
          className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 border border-line-strong bg-panel px-3 text-sm text-foreground active:translate-y-px disabled:opacity-50"
        >
          <Dices className="size-4" aria-hidden />
          {rolling ? t('avatar.saving') : t('avatar.reroll')}
        </button>
        {failed && (
          <span className="text-xs text-blood" role="alert" data-testid={`${testId}-error`}>
            {t('avatar.saveFailed')}
          </span>
        )}
      </div>
    </div>
  );
}
