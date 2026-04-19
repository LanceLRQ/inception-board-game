// AvatarPicker - "摇骰子"换头像 UI
// 对照：plans/design/06-frontend-design.md §6.7 像素头像选择器 / ADR-032
//
// 交互：
//   - 大头像预览（当前 seed）
//   - 下方 🎲 按钮：每点一次生成新随机 seed
//   - "保存" 按钮：回调上层持久化 avatarSeed
//   - "撤销" 按钮：恢复为传入的初始 seed

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { generateRandomAvatarSeed } from '@icgame/shared';
import { PixelAvatar } from '../PixelAvatar';
import { cn } from '../../lib/utils';

export interface AvatarPickerProps {
  readonly initialSeed: string;
  readonly onSave?: (seed: string) => void | Promise<void>;
  readonly className?: string;
  /** 预览尺寸（默认 128） */
  readonly previewSize?: number;
  /** 是否禁用保存按钮（上层保存中） */
  readonly saving?: boolean;
}

export function AvatarPicker({
  initialSeed,
  onSave,
  className,
  previewSize = 128,
  saving = false,
}: AvatarPickerProps) {
  const { t } = useTranslation();
  const [currentSeed, setCurrentSeed] = useState<string>(initialSeed);
  const [rollCount, setRollCount] = useState(0);

  const roll = useCallback(() => {
    setCurrentSeed(generateRandomAvatarSeed());
    setRollCount((c) => c + 1);
  }, []);

  const undo = useCallback(() => {
    setCurrentSeed(initialSeed);
    setRollCount(0);
  }, [initialSeed]);

  const handleSave = useCallback(async () => {
    if (!onSave || currentSeed === initialSeed) return;
    await onSave(currentSeed);
  }, [onSave, currentSeed, initialSeed]);

  const hasChanged = currentSeed !== initialSeed;

  return (
    <div className={cn('flex flex-col items-center gap-4 rounded-xl bg-card p-4', className)}>
      {/* 头像预览（摇骰时轻微抖动） */}
      <motion.div
        key={currentSeed}
        initial={{ scale: 0.92, rotate: -4 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 18 }}
      >
        <PixelAvatar seed={currentSeed} size={previewSize} />
      </motion.div>

      <div className="text-xs text-muted-foreground">
        {t('avatar.rolls', { count: rollCount, defaultValue: `已摇骰 ${rollCount} 次` })}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={roll}
          className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
          aria-label={t('avatar.roll', { defaultValue: '摇骰换头像' })}
        >
          🎲 {t('avatar.roll', { defaultValue: '摇一摇' })}
        </button>
        {hasChanged ? (
          <button
            type="button"
            onClick={undo}
            className="rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/70"
          >
            {t('avatar.undo', { defaultValue: '撤销' })}
          </button>
        ) : null}
        {onSave ? (
          <button
            type="button"
            disabled={!hasChanged || saving}
            onClick={handleSave}
            className={cn(
              'rounded-full px-4 py-2 text-sm transition-colors',
              hasChanged && !saving
                ? 'bg-green-600 text-white hover:bg-green-500 active:scale-95'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60',
            )}
          >
            {saving
              ? t('avatar.saving', { defaultValue: '保存中...' })
              : t('avatar.save', { defaultValue: '保存' })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
