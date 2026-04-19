// AudioControls - 音效开关 + 音量滑块（设置页用）
// 对照：plans/design/06-frontend-design.md §6.19.5

import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../../stores/useAudioStore.js';
import { useSoundEffect } from '../../hooks/useSoundEffect.js';
import { cn } from '../../lib/utils.js';

export function AudioControls({ className }: { className?: string }) {
  const { t } = useTranslation();
  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);
  const setVolume = useAudioStore((s) => s.setVolume);
  const toggleMuted = useAudioStore((s) => s.toggleMuted);
  const play = useSoundEffect();

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm">{t('settings.audio.muted', { defaultValue: '静音' })}</span>
        <button
          type="button"
          onClick={toggleMuted}
          aria-pressed={muted}
          className={cn(
            'rounded-full px-3 py-1 text-xs transition-colors',
            muted
              ? 'bg-destructive/20 text-destructive'
              : 'bg-primary/20 text-primary hover:bg-primary/30',
          )}
        >
          {muted
            ? t('settings.audio.on', { defaultValue: '已静音' })
            : t('settings.audio.off', { defaultValue: '开启音效' })}
        </button>
      </div>

      <label className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {t('settings.audio.volume', { defaultValue: '音量' })}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          onMouseUp={() => play('dice-land')}
          onTouchEnd={() => play('dice-land')}
          disabled={muted}
          className="flex-1 accent-primary disabled:opacity-50"
          aria-label={t('settings.audio.volume', { defaultValue: '音量' })}
        />
        <span className="w-8 text-right text-xs text-muted-foreground">
          {Math.round(volume * 100)}
        </span>
      </label>
    </div>
  );
}
