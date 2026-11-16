// TutorialOverlay - 教学气泡 + 蒙层
// 新手教学关卡

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TutorialStep } from '@icgame/shared';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogTitle } from '../ui/dialog';
import { Progress } from '../ui/progress';

export interface TutorialOverlayProps {
  readonly step: TutorialStep;
  readonly currentIndex: number;
  readonly totalSteps: number;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly children?: ReactNode;
  readonly onSkip: () => void;
  readonly onChoose: (choiceId: string) => void;
  readonly onClose?: () => void;
}

export function TutorialOverlay({
  step,
  currentIndex,
  totalSteps,
  onNext,
  onPrevious,
  children,
  onSkip,
  onChoose,
  onClose,
}: TutorialOverlayProps) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [step.id]);
  const percent = Math.round(((currentIndex + 1) / totalSteps) * 100);

  // 教学气泡不能点背景或按 Esc 关闭：只能走「跳过教学」或右上角关闭按钮
  return (
    <Dialog
      open
      blocking
      size="md"
      aria-label={step.title ? undefined : t('tutorial.aria_label', { defaultValue: '新手教学' })}
      className="flex flex-col overflow-hidden p-5"
    >
      {/* 顶部进度 */}
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {t('tutorial.step_count', {
            defaultValue: '第 {{current}} / {{total}} 步',
            current: currentIndex + 1,
            total: totalSteps,
          })}
        </span>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: '关闭' })}
            className="size-11 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>

      <Progress value={percent} aria-label={t('tutorial.progress')} className="mb-4 shrink-0" />

      {/* 标题 + 正文 */}
      <div
        ref={contentRef}
        className="min-h-0 overflow-y-auto overscroll-contain"
        tabIndex={0}
        role="region"
        aria-label={step.title}
      >
        {step.title && (
          <DialogTitle className="mb-2 text-lg font-bold text-foreground">{step.title}</DialogTitle>
        )}
        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
          {step.body}
        </p>
        {children}
      </div>

      {/* 操作始终留在可视区，只有正文滚动。 */}
      <div className="mt-4 shrink-0">
        {step.kind === 'choice' && step.choices ? (
          <div className="space-y-2">
            {step.choices.map((c) => (
              <Button
                key={c.id}
                type="button"
                variant="outline"
                onClick={() => onChoose(c.id)}
                className="h-auto min-h-11 w-full px-4 py-2 hover:border-primary hover:bg-primary/10"
              >
                {c.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onSkip}
              className="min-h-11 px-2 text-muted-foreground"
            >
              {t('tutorial.skip', { defaultValue: '跳过教学' })}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={currentIndex === 0}
                onClick={onPrevious}
                className="min-h-11 px-3"
              >
                {t('tutorial.previous')}
              </Button>
              <Button type="button" onClick={onNext} className="min-h-11 px-4">
                {currentIndex + 1 >= totalSteps
                  ? t('tutorial.finish', { defaultValue: '完成' })
                  : t('tutorial.next', { defaultValue: '继续' })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
