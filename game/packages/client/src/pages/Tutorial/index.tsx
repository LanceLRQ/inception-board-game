// Tutorial 页面
// 对照：plans/tasks.md W8.5-9 · 新手教学关卡

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BASICS_TUTORIAL, getCurrentStep, isCompleted } from '@icgame/shared';
import { TutorialOverlay } from '../../components/TutorialOverlay';
import { CopyrightNotice } from '../../components/CopyrightNotice';
import { useTutorialStore } from '../../stores/useTutorialStore';
import { PartyPopper } from 'lucide-react';

export default function Tutorial() {
  const progress = useTutorialStore((s) => s.progress);
  const start = useTutorialStore((s) => s.start);
  const dispatch = useTutorialStore((s) => s.dispatch);
  const reset = useTutorialStore((s) => s.reset);
  const navigate = useNavigate();

  // 首次进入自动初始化
  useEffect(() => {
    if (!progress || progress.scenarioId !== BASICS_TUTORIAL.id) {
      start(BASICS_TUTORIAL);
    }
  }, [progress, start]);

  if (!progress) {
    return null;
  }

  // 完成后展示结算
  if (isCompleted(progress)) {
    return (
      <div className="min-h-screen bg-background p-6 text-foreground flex flex-col items-center justify-center">
        <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold">
          <PartyPopper className="h-6 w-6" /> 教学完成
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">已掌握基础规则，可以开始真正的对局啦～</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              reset();
              start(BASICS_TUTORIAL);
            }}
            className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            重新教学
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-full bg-primary px-6 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            返回首页
          </button>
        </div>
        <CopyrightNotice variant="footer" className="mt-8" />
      </div>
    );
  }

  const step = getCurrentStep(BASICS_TUTORIAL, progress);
  if (!step) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* 第 3 处版权展示：教学前 */}
      <CopyrightNotice variant="footer" className="p-4" />
      <TutorialOverlay
        step={step}
        currentIndex={progress.currentStepIndex}
        totalSteps={BASICS_TUTORIAL.steps.length}
        onNext={() => dispatch(BASICS_TUTORIAL, { type: 'next' })}
        onSkip={() => dispatch(BASICS_TUTORIAL, { type: 'skip' })}
        onChoose={(choiceId) => dispatch(BASICS_TUTORIAL, { type: 'choose', choiceId })}
        onClose={() => navigate('/')}
      />
    </div>
  );
}
