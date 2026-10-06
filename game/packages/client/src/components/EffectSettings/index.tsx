// EffectSettings - 视觉效果设置：「减少动效」三态 + 当前主题用得到的装饰效果开关
//
// 减少动效对所有主题都有意义，所以始终显示；装饰效果开关只显示当前主题用得到的，
// 当前主题没有可关的装饰效果（如深眠影院）时只剩减少动效。

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useEffectsStore } from '../../stores/useEffectsStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { MOTION_PREFS, effectsForTheme, isEffectOn } from '../../theme/effects';

export interface EffectSettingsProps {
  readonly className?: string;
}

export function EffectSettings({ className }: EffectSettingsProps) {
  const { t } = useTranslation();
  const uid = useId();
  const themeId = useThemeStore((s) => s.themeId);
  const prefs = useEffectsStore((s) => s.prefs);
  const setEffectOn = useEffectsStore((s) => s.setEffectOn);
  const setMotion = useEffectsStore((s) => s.setMotion);
  const effects = effectsForTheme(themeId);
  const motionLabelId = `${uid}-motion`;
  const motionDescId = `${uid}-motion-desc`;

  return (
    <div data-testid="effect-settings" className={cn('space-y-4', className)}>
      <h3 className="text-sm font-semibold text-muted-foreground">{t('effects.heading')}</h3>

      <div className="space-y-2">
        <div>
          <div id={motionLabelId} className="text-sm">
            {t('effects.motion.label')}
          </div>
          <p id={motionDescId} className="text-xs text-muted-foreground">
            {t('effects.motion.desc')}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-labelledby={motionLabelId}
          aria-describedby={motionDescId}
          data-testid="motion-pref"
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        >
          {MOTION_PREFS.map((pref) => {
            const checked = prefs.motion === pref;
            return (
              <button
                key={pref}
                type="button"
                role="radio"
                aria-checked={checked}
                data-testid={`motion-pref-${pref}`}
                onClick={() => setMotion(pref)}
                className={cn(
                  'min-h-11 rounded-md px-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                  checked
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                {t(`effects.motion.options.${pref}`)}
              </button>
            );
          })}
        </div>
      </div>

      {effects.length > 0 && (
        <ul data-testid="effect-switches" className="divide-y divide-border">
          {effects.map((effect) => {
            const nameId = `${uid}-${effect.key}`;
            const descId = `${uid}-${effect.key}-desc`;
            return (
              <li
                key={effect.key}
                data-testid={`effect-row-${effect.key}`}
                className="flex min-h-11 items-center justify-between gap-3 py-1"
              >
                <div className="min-w-0">
                  <div id={nameId} className="text-sm">
                    {t(effect.nameKey)}
                  </div>
                  <p id={descId} className="text-xs text-muted-foreground">
                    {t(effect.descKey)}
                  </p>
                </div>
                <Switch
                  data-testid={`effect-switch-${effect.key}`}
                  aria-labelledby={nameId}
                  aria-describedby={descId}
                  checked={isEffectOn(prefs, effect.key)}
                  onCheckedChange={(on) => setEffectOn(effect.key, on)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
