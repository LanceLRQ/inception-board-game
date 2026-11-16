// 独立教程：阅读进度与网页目的地分别由 store 和页面处理。
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSiteReturnTo } from '../../hooks/useSiteReturnTo';
import { BASICS_TUTORIAL, getCurrentStep, isCompleted } from '@icgame/shared';
import { TutorialOverlay } from '../../components/TutorialOverlay';
import { CopyrightNotice } from '../../components/CopyrightNotice';
import { useTutorialStore } from '../../stores/useTutorialStore';
import { Button, buttonVariants } from '@/components/ui/button';

export default function Tutorial() {
  const { t } = useTranslation();
  const returnTo = useSiteReturnTo();
  const progress = useTutorialStore((s) => s.progress);
  const start = useTutorialStore((s) => s.start);
  const dispatch = useTutorialStore((s) => s.dispatch);
  const navigate = useNavigate();
  // 旧版跳过也写入 completedAt；没有读完全部步骤的记录不能显示完成。
  const needsStart =
    !progress ||
    progress.scenarioId !== BASICS_TUTORIAL.id ||
    (isCompleted(progress) && progress.completedStepIds.length < BASICS_TUTORIAL.steps.length);

  useEffect(() => {
    if (needsStart) start(BASICS_TUTORIAL);
  }, [needsStart, start]);

  if (!progress || needsStart) return null;

  if (isCompleted(progress)) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-md">
          <h1 className="mb-6 text-2xl font-bold">{t('tutorial.completed')}</h1>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/local" className={buttonVariants({ className: 'min-h-11 px-4' })}>
              {t('tutorial.practice')}
            </Link>
            <Link
              to="/lobby"
              className={buttonVariants({ variant: 'outline', className: 'min-h-11 px-4' })}
            >
              {t('tutorial.lobby')}
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => start(BASICS_TUTORIAL)}
              className="min-h-11"
            >
              {t('tutorial.restart')}
            </Button>
            {returnTo === '/' && (
              <Link to="/" className={buttonVariants({ variant: 'ghost', className: 'min-h-11' })}>
                {t('error.home')}
              </Link>
            )}
          </div>
        </div>
        <CopyrightNotice variant="footer" className="mt-8" />
      </main>
    );
  }

  const step = getCurrentStep(BASICS_TUTORIAL, progress);
  if (!step) return null;

  return (
    <div className="min-h-dvh bg-background">
      <CopyrightNotice variant="footer" className="p-4" />
      <TutorialOverlay
        step={step}
        currentIndex={progress.currentStepIndex}
        totalSteps={BASICS_TUTORIAL.steps.length}
        onNext={() => dispatch(BASICS_TUTORIAL, { type: 'next' })}
        onPrevious={() => dispatch(BASICS_TUTORIAL, { type: 'previous' })}
        onSkip={() => {
          dispatch(BASICS_TUTORIAL, { type: 'skip' });
          navigate(returnTo);
        }}
        onChoose={(choiceId) => dispatch(BASICS_TUTORIAL, { type: 'choose', choiceId })}
        onClose={() => navigate(returnTo)}
      >
        {step.id === 'layers' && (
          <ol aria-label="四层梦境示意" className="mt-4 space-y-2 text-sm">
            {[4, 3, 2, 1].map((layer) => (
              <li key={layer} className="flex justify-between rounded-md bg-muted px-3 py-2">
                <span>第 {layer} 层</span>
                <span className="text-muted-foreground">心锁 → 金库</span>
              </li>
            ))}
          </ol>
        )}
        {step.id === 'turn_flow' && (
          <ol aria-label="回合顺序" className="mt-4 space-y-2 text-sm">
            {[
              '回合开始',
              '抽牌：通常抽 2 张',
              '出牌：使用手牌或技能',
              '弃牌：通常弃至 5 张',
              '回合结束：轮到下一位',
            ].map((phase, index) => (
              <li key={phase} className="flex gap-3">
                <span className="tabular-nums text-muted-foreground">{index + 1}</span>
                {phase}
              </li>
            ))}
          </ol>
        )}
      </TutorialOverlay>
    </div>
  );
}
