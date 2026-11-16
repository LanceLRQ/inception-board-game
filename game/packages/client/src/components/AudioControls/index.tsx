// AudioControls - 音效开关 + 音量滑块（设置页用）

import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../../stores/useAudioStore.js';
import { useSoundEffect } from '../../hooks/useSoundEffect.js';
import { cn } from '../../lib/utils.js';
import { Switch } from '../ui/switch';

export function AudioControls({ className }: { className?: string }) {
  const { t } = useTranslation();
  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);
  const setVolume = useAudioStore((s) => s.setVolume);
  const toggleMuted = useAudioStore((s) => s.toggleMuted);
  const play = useSoundEffect();

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-3">
        <Switch aria-label={t('settings.sound')} checked={!muted} onCheckedChange={toggleMuted} />
        <span aria-hidden="true" className="text-sm">
          {t(muted ? 'settings.audio.on' : 'settings.audio.off')}
        </span>
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
          className="h-11 min-w-0 flex-1 accent-primary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          aria-label={t('settings.audio.volume', { defaultValue: '音量' })}
        />
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(volume * 100)}%
        </span>
      </label>
    </div>
  );
}
