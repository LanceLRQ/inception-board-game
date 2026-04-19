// 教学剧本 Schema（MVP 版）
// 对照：plans/tasks.md W8.5-9 · 新手教学关卡

export type TutorialStepKind = 'info' | 'highlight' | 'action' | 'choice';

/** 单个步骤 */
export interface TutorialStep {
  /** 唯一 id（跳转 + 持久化用） */
  readonly id: string;
  readonly kind: TutorialStepKind;
  /** 标题（可选） */
  readonly title?: string;
  /** 正文（Markdown-ish 简单文本） */
  readonly body: string;
  /** UI 提示：高亮元素的 CSS 选择器（kind=highlight/action 时有意义） */
  readonly targetSelector?: string;
  /** 气泡显示位置（相对 target） */
  readonly placement?: 'top' | 'right' | 'bottom' | 'left' | 'center';
  /** 等待用户按钮：默认 'next'；choice 时为选项列表 */
  readonly cta?: 'next' | 'continue' | 'skip';
  /** choice 类型的候选项 */
  readonly choices?: readonly { readonly id: string; readonly label: string }[];
  /** 图例/图标 key（可选） */
  readonly iconKey?: string;
}

/** 完整剧本 */
export interface TutorialScenario {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly steps: readonly TutorialStep[];
}

/** 进度（持久化到 localStorage 或 server） */
export interface TutorialProgress {
  readonly scenarioId: string;
  readonly currentStepIndex: number;
  readonly completedStepIds: readonly string[];
  readonly completedAt: number | null;
  readonly skippedCount: number;
  readonly startedAt: number;
}

/** 用户交互事件 */
export type TutorialEvent =
  | { readonly type: 'next' }
  | { readonly type: 'skip' }
  | { readonly type: 'choose'; readonly choiceId: string }
  | { readonly type: 'restart' };
