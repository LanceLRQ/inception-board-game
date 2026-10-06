// 底部坞的操作区：随选中牌变化的「打出 XX」、随阶段变化的主操作、「技能」
// 两步出牌：点牌选中 → 点「打出」才进入出牌流程；主操作不是本人回合时禁用。
// 技能按钮用浮层承载现有的 ActiveSkillPanel，发动后自动收起。样式钩子类名：ms-btn。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { ActiveSkillPanel } from '../../ActiveSkillPanel';
import type { MatchController } from '../controllerTypes';
import { deriveMainAction } from '../model/handDerive';

interface DockOpsProps {
  readonly controller: MatchController;
  /** 选中且此刻可打的牌名；没有则不显示「打出」 */
  readonly commitName: string | null;
  readonly onCommit: () => void;
  /** 有主动技能可用 */
  readonly skillReady: boolean;
}

export function DockOps({ controller, commitName, onCommit, skillReady }: DockOpsProps) {
  const { t } = useTranslation();
  const { turn, actions, hand, winner, skillPanel } = controller;
  const [skillOpen, setSkillOpen] = useState(false);
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
      className="ms-dock-ops flex shrink-0 flex-col justify-end gap-1.5 pl-4"
      style={{ width: 'clamp(150px, 13vw, 210px)' }}
      data-testid="dock-ops"
    >
      {commitName && (
        <button
          type="button"
          onClick={onCommit}
          data-testid="hand-commit-play"
          data-variant="primary"
          className="ms-btn min-h-8 truncate px-3 text-[12px] tracking-[.14em]"
        >
          {t('desktop.dock.commit', { card: commitName })}
        </button>
      )}
      <button
        type="button"
        disabled={!main.enabled}
        onClick={onMain}
        data-testid={main.testId}
        data-kind={main.kind}
        data-variant={main.enabled && main.kind !== 'end' ? 'primary' : undefined}
        className="ms-btn min-h-8 px-3 text-[12px] tracking-[.14em] whitespace-nowrap"
      >
        {t(main.labelKey, {
          selected: actions.discardSelected,
          required: actions.discardRequired,
        })}
      </button>
      <Popover open={skillOpen && skillPanel !== null} onOpenChange={setSkillOpen}>
        <PopoverTrigger
          disabled={!skillReady}
          aria-label={t('dock.skillAria')}
          data-testid="dock-skill"
          className={cn('ms-btn min-h-8 px-3 text-[12px] tracking-[.14em] whitespace-nowrap')}
        >
          {t('dock.skill')}
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          data-testid="skill-popover"
          className="max-h-[60dvh] w-80 overflow-y-auto"
        >
          {skillPanel && (
            <ActiveSkillPanel
              context={skillPanel.context}
              availableTargetIds={skillPanel.targetIds}
              playerNicknames={skillPanel.nicknames}
              onInvoke={(skill, args) => {
                skillPanel.invoke(skill, args);
                setSkillOpen(false);
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
