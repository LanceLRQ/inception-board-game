// TutorialOverlay - 教学气泡 + 蒙层
// 新手教学关卡

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

  // 教学气泡不能点背景或按 Esc 关闭：只能走「跳过教学」或右上角关闭按钮
  return (
    <Dialog
      open
      blocking
      size="md"
      aria-label={step.title ? undefined : t('tutorial.aria_label', { defaultValue: '新手教学' })}
      className="p-6"
    >
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
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: '关闭' })}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>

      <Progress value={percent} className="mb-4" />

      {/* 标题 + 正文 */}
      {step.title && (
        <DialogTitle className="mb-2 text-lg font-bold text-foreground">{step.title}</DialogTitle>
      )}
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
        {step.body}
      </p>

      {/* 操作区 */}
      {step.kind === 'choice' && step.choices ? (
        <div className="space-y-2">
          {step.choices.map((c) => (
            <Button
              key={c.id}
              type="button"
              variant="outline"
              onClick={() => onChoose(c.id)}
              className="h-auto w-full px-4 py-2 hover:border-primary hover:bg-primary/10"
            >
              {c.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={onSkip} className="text-muted-foreground">
            {t('tutorial.skip', { defaultValue: '跳过教学' })}
          </Button>
          <Button type="button" onClick={onNext} className="rounded-full px-6">
            {currentIndex + 1 >= totalSteps
              ? t('tutorial.finish', { defaultValue: '完成' })
              : t('tutorial.next', { defaultValue: '继续' })}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
