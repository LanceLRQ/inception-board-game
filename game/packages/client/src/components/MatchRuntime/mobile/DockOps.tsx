// 手牌坞的操作区：「技能」按钮 + 随阶段变化的主操作按钮（抽牌 / 结束行动 / 跳过弃牌 / 确认弃牌）
// 不是本人回合时主操作禁用并显示「等待」。高度不小于 42px。

import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { MatchController } from '../controllerTypes';
import { deriveMainAction } from './dockDerive';

interface DockOpsProps {
  readonly controller: MatchController;
  /** 有主动技能可用 */
  readonly skillReady: boolean;
  readonly onOpenSkill: () => void;
  /** column：收起态右侧竖排；row：展开态底部横排 */
  readonly layout: 'column' | 'row';
}

export function DockOps({ controller, skillReady, onOpenSkill, layout }: DockOpsProps) {
  const { t } = useTranslation();
  const { turn, actions, hand, winner } = controller;
  const main = deriveMainAction({
    isMine: turn.isMine,
    winner,
    phase: turn.phase,
    overflow: hand.overflow,
    canConfirmDiscard: actions.canConfirmDiscard,
  });
  const onMain = () => {
    if (!main.enabled) return;
    if (main.kind === 'draw') actions.draw();
    else if (main.kind === 'end') actions.endAction();
    else if (main.kind === 'skipDiscard') actions.skipDiscard();
    else if (main.kind === 'confirmDiscard') actions.confirmDiscard();
  };

  return (
    <div
      className={cn('flex shrink-0 gap-1.5', layout === 'column' ? 'flex-col' : 'flex-row')}
      data-testid="dock-ops"
    >
      <button
        type="button"
        disabled={!skillReady}
        onClick={onOpenSkill}
        aria-label={t('mobile.dock.skillAria')}
        data-testid="dock-skill"
        className={cn(
          'min-h-[42px] min-w-[68px] touch-manipulation border border-line-strong bg-transparent px-3 text-[11.5px] tracking-[.08em] whitespace-nowrap text-dim active:translate-y-px disabled:opacity-40',
          layout === 'row' && 'flex-1',
        )}
      >
        {t('mobile.dock.skill')}
      </button>
      <button
        type="button"
        disabled={!main.enabled}
        onClick={onMain}
        data-testid={main.testId}
        data-kind={main.kind}
        className={cn(
          'min-h-[42px] min-w-[68px] touch-manipulation border px-3 text-[11.5px] tracking-[.08em] whitespace-nowrap active:translate-y-px',
          layout === 'row' && 'flex-[2]',
          main.enabled
            ? 'border-acc bg-acc-soft font-semibold text-acc-bright'
            : 'border-line-strong bg-transparent text-faint',
        )}
      >
        {t(main.labelKey, {
          selected: actions.discardSelected,
          required: actions.discardRequired,
        })}
      </button>
    </div>
  );
}
