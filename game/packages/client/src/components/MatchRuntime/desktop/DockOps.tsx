// 底部坞的操作区：随选中牌变化的「打出 XX」、随阶段变化的主操作、「技能」
// 两步出牌：点牌选中 → 点「打出」才进入出牌流程；主操作不是本人回合时禁用。
// 技能选择使用统一弹层，发动后自动收起。

import { getSkillEntries } from '../../../lib/activeSkills';
import { useDrawStore } from '../../../stores/useDrawStore';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogHeader, DialogTitle, DialogBody } from '../../ui/dialog';
import { ActiveSkillPanel } from '../../ActiveSkillPanel';
import type { MatchController } from '../controllerTypes';
import { deriveMainAction } from '../model/handDerive';
import { DockEntries } from '../shared/DockEntries';

interface DockOpsProps {
  readonly controller: MatchController;
  /** 有主动技能可用 */
  readonly skillReady: boolean;
}

export function DockOps({ controller, skillReady }: DockOpsProps) {
  const { t } = useTranslation();
  const { turn, actions, hand, winner, skillPanel } = controller;
  const [skillOpen, setSkillOpen] = useState<string | null>(null);
  const skillStamp = `${turn.number}:${turn.phase}`;
  const autoDraw = useDrawStore((s) => s.autoDraw);
  const setAutoDraw = useDrawStore((s) => s.setAutoDraw);
  const drawSkills = skillPanel
    ? getSkillEntries(skillPanel.context).filter(
        (entry) => entry.enabled && entry.skill.requiredPhase === 'draw',
      )
    : [];
  const drawPhase = turn.isMine && turn.phase === 'draw' && !winner;
  const hasDrawSkill =
    drawPhase &&
    (drawSkills.length > 0 ||
      controller.entries.some((entry) => entry.kind !== 'skipDraw' && entry.enabled));
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
    <div className="tabletop-hand-tools" data-testid="dock-ops">
      {!hasDrawSkill && (
        <label className="flex min-h-11 items-center gap-1.5 text-xs text-dim">
          <input
            type="checkbox"
            checked={autoDraw}
            onChange={(event) => setAutoDraw(event.target.checked)}
            data-testid="auto-draw-toggle"
          />
          自动抽牌
        </label>
      )}
      {drawPhase && turn.deadlineSeconds !== null && turn.deadlineSeconds !== undefined && (
        <span className="text-xs text-dim" role="status">
          {turn.deadlineSeconds} 秒后抽牌
        </span>
      )}
      <DockEntries
        entries={
          drawPhase
            ? controller.entries.filter((entry) => entry.kind === 'skipDraw' || entry.enabled)
            : controller.entries
        }
        variant="desktop"
      />
      <button
        type="button"
        onClick={() => setSkillOpen(skillStamp)}
        disabled={!skillReady}
        aria-label={t('dock.skillAria')}
        data-testid="dock-skill"
        className="ms-btn min-h-11 px-3 text-xs whitespace-nowrap"
      >
        {drawSkills.length ? t(drawSkills[0]!.skill.nameKey) : t('dock.skill')}
      </button>
      {main.kind !== 'confirmDiscard' && main.kind !== 'wait' && (
        <button
          type="button"
          disabled={!main.enabled}
          onClick={onMain}
          data-testid={main.testId}
          data-kind={main.kind}
          data-variant="primary"
          className="tabletop-primary whitespace-nowrap"
        >
          {t(main.labelKey, {
            selected: actions.discardSelected,
            required: actions.discardRequired,
          })}
        </button>
      )}
      <Dialog
        open={skillOpen === skillStamp && skillPanel !== null && skillReady}
        onOpenChange={(open) => setSkillOpen(open ? skillStamp : null)}
        blocking={false}
        data-testid="skill-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t('dock.skillAria')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {skillPanel && (
            <ActiveSkillPanel
              context={skillPanel.context}
              availableTargetIds={skillPanel.targetIds}
              lostTargetIds={skillPanel.lostTargetIds}
              playerNicknames={skillPanel.nicknames}
              onInvoke={(skill, args) => {
                skillPanel.invoke(skill, args);
                setSkillOpen(null);
              }}
            />
          )}
        </DialogBody>
      </Dialog>
    </div>
  );
}
