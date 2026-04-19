// TutorialOverlay - 教学气泡 + 蒙层
// 对照：plans/tasks.md W8.5-9 · 新手教学关卡

import { useTranslation } from 'react-i18next';
import type { TutorialStep } from '@icgame/shared';
import { cn } from '../../lib/utils.js';

export interface TutorialOverlayProps {
  readonly step: TutorialStep;
  readonly currentIndex: number;
  readonly totalSteps: number;
  readonly onNext: () => void;
  readonly onSkip: () => void;
  readonly onChoose: (choiceId: string) => void;
  readonly onClose?: () => void;
}

export function TutorialOverlay({
  step,
  currentIndex,
  totalSteps,
  onNext,
  onSkip,
  onChoose,
  onClose,
}: TutorialOverlayProps) {
  const { t } = useTranslation();
  const percent = Math.round(((currentIndex + 1) / totalSteps) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
        {/* 顶部进度 */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t('tutorial.step_count', {
              defaultValue: '第 {{current}} / {{total}} 步',
              current: currentIndex + 1,
              total: totalSteps,
            })}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', { defaultValue: '关闭' })}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        <div
          className="mb-4 h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* 标题 + 正文 */}
        {step.title && (
          <h2 id="tutorial-title" className="mb-2 text-lg font-bold text-foreground">
            {step.title}
          </h2>
        )}
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
          {step.body}
        </p>

        {/* 操作区 */}
        {step.kind === 'choice' && step.choices ? (
          <div className="space-y-2">
            {step.choices.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChoose(c.id)}
                className={cn(
                  'w-full rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors',
                  'hover:bg-primary/10 hover:border-primary',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex justify-between">
            <button
              type="button"
              onClick={onSkip}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t('tutorial.skip', { defaultValue: '跳过教学' })}
            </button>
            <button
              type="button"
              onClick={onNext}
              className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {currentIndex + 1 >= totalSteps
                ? t('tutorial.finish', { defaultValue: '完成' })
                : t('tutorial.next', { defaultValue: '继续' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
