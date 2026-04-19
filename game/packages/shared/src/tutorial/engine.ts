// TutorialEngine - 教学状态推进（纯函数）
// 对照：plans/tasks.md W8.5-9 · 新手教学关卡

import type { TutorialEvent, TutorialProgress, TutorialScenario, TutorialStep } from './types.js';

/** 纯函数：起始进度 */
export function initialProgress(
  scenario: TutorialScenario,
  now: () => number = Date.now,
): TutorialProgress {
  return {
    scenarioId: scenario.id,
    currentStepIndex: 0,
    completedStepIds: [],
    completedAt: null,
    skippedCount: 0,
    startedAt: now(),
  };
}

/** 纯函数：取当前步骤（越界返回 null） */
export function getCurrentStep(
  scenario: TutorialScenario,
  progress: TutorialProgress,
): TutorialStep | null {
  if (progress.scenarioId !== scenario.id) return null;
  if (progress.currentStepIndex < 0) return null;
  if (progress.currentStepIndex >= scenario.steps.length) return null;
  return scenario.steps[progress.currentStepIndex] ?? null;
}

/** 纯函数：是否已完成 */
export function isCompleted(progress: TutorialProgress): boolean {
  return progress.completedAt !== null;
}

/** 纯函数：百分比（0..100） */
export function computeProgressPercent(
  scenario: TutorialScenario,
  progress: TutorialProgress,
): number {
  if (scenario.steps.length === 0) return 0;
  const done = Math.min(progress.currentStepIndex, scenario.steps.length);
  return Math.min(100, Math.round((done / scenario.steps.length) * 100));
}

/**
 * 纯函数：推进进度（不可变）。
 *
 * - next: 推进到下一步并把当前步 id 加入 completedStepIds
 * - skip: 同 next，但 skippedCount++
 * - choose: 记录选择 + 前进（当前实现不做分支跳转，留作扩展）
 * - restart: 重置到第一步（保留 startedAt）
 */
export function advance(
  scenario: TutorialScenario,
  progress: TutorialProgress,
  event: TutorialEvent,
  now: () => number = Date.now,
): TutorialProgress {
  if (isCompleted(progress) && event.type !== 'restart') return progress;

  const step = getCurrentStep(scenario, progress);
  const markDone = (): readonly string[] =>
    step && !progress.completedStepIds.includes(step.id)
      ? [...progress.completedStepIds, step.id]
      : progress.completedStepIds;

  switch (event.type) {
    case 'next': {
      const nextIdx = progress.currentStepIndex + 1;
      const atEnd = nextIdx >= scenario.steps.length;
      return {
        ...progress,
        currentStepIndex: nextIdx,
        completedStepIds: markDone(),
        completedAt: atEnd ? now() : progress.completedAt,
      };
    }
    case 'skip': {
      // 直接跳到末尾
      return {
        ...progress,
        currentStepIndex: scenario.steps.length,
        completedStepIds: markDone(),
        completedAt: now(),
        skippedCount: progress.skippedCount + 1,
      };
    }
    case 'choose': {
      // MVP 阶段：choice 不分支，推进一步
      const nextIdx = progress.currentStepIndex + 1;
      const atEnd = nextIdx >= scenario.steps.length;
      return {
        ...progress,
        currentStepIndex: nextIdx,
        completedStepIds: markDone(),
        completedAt: atEnd ? now() : progress.completedAt,
      };
    }
    case 'restart':
      return {
        ...progress,
        currentStepIndex: 0,
        completedStepIds: [],
        completedAt: null,
      };
  }
}

/** 纯函数：跳到指定 step id（仅允许跳到已解锁或当前步骤；越界 no-op） */
export function jumpToStepId(
  scenario: TutorialScenario,
  progress: TutorialProgress,
  stepId: string,
): TutorialProgress {
  const idx = scenario.steps.findIndex((s) => s.id === stepId);
  if (idx < 0) return progress;
  // 仅允许向回跳到已完成 step，或当前步骤
  if (idx > progress.currentStepIndex) return progress;
  return { ...progress, currentStepIndex: idx };
}

/** 纯函数：Schema 校验（返回违规列表，空数组 = 合法） */
export function validateScenario(scenario: TutorialScenario): string[] {
  const issues: string[] = [];
  if (!scenario.id) issues.push('scenario.id missing');
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    issues.push('scenario.steps is empty');
  }
  const seenIds = new Set<string>();
  for (const s of scenario.steps ?? []) {
    if (!s.id) issues.push(`step without id`);
    if (seenIds.has(s.id)) issues.push(`duplicate step id: ${s.id}`);
    seenIds.add(s.id);
    if (!s.body) issues.push(`step ${s.id} has empty body`);
    if (s.kind === 'choice' && (!s.choices || s.choices.length === 0)) {
      issues.push(`step ${s.id} is choice but has no choices`);
    }
  }
  return issues;
}
