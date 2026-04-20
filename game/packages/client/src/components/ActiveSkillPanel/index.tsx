// 主动技能按钮面板 —— 行动阶段人类玩家可见
// 对照：client/src/lib/activeSkills.ts + engine/abilities/characters/thief/*

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getAvailableActiveSkills,
  type ActiveSkillContext,
  type ActiveSkillDescriptor,
} from '../../lib/activeSkills';
import { cn } from '../../lib/utils';

interface ActiveSkillPanelProps {
  readonly context: ActiveSkillContext;
  readonly availableTargetIds: readonly string[];
  readonly playerNicknames: Record<string, string>;
  readonly onInvoke: (skill: ActiveSkillDescriptor, args: unknown[]) => void;
}

export function ActiveSkillPanel({
  context,
  availableTargetIds,
  playerNicknames,
  onInvoke,
}: ActiveSkillPanelProps) {
  const { t } = useTranslation();
  const [pendingTargetSkill, setPendingTargetSkill] = useState<ActiveSkillDescriptor | null>(null);
  const [pendingChoiceSkill, setPendingChoiceSkill] = useState<ActiveSkillDescriptor | null>(null);
  const [pendingCardSkill, setPendingCardSkill] = useState<ActiveSkillDescriptor | null>(null);
  // cardAndPlayer: 先选卡再选玩家
  const [pendingCardPlayerSkill, setPendingCardPlayerSkill] = useState<{
    skill: ActiveSkillDescriptor;
    card: string | null;
  } | null>(null);
  const [pendingLayerSkill, setPendingLayerSkill] = useState<ActiveSkillDescriptor | null>(null);
  // playerAndLayer: 先选玩家再选层
  const [pendingPlayerLayerSkill, setPendingPlayerLayerSkill] = useState<{
    skill: ActiveSkillDescriptor;
    targetId: string | null;
  } | null>(null);
  // playerAndCard: 先选玩家再选卡
  const [pendingPlayerCardSkill, setPendingPlayerCardSkill] = useState<{
    skill: ActiveSkillDescriptor;
    targetId: string | null;
  } | null>(null);
  // multiCard: 多选手牌
  const [pendingMultiCardSkill, setPendingMultiCardSkill] = useState<{
    skill: ActiveSkillDescriptor;
    selected: string[];
  } | null>(null);

  const skills = getAvailableActiveSkills(context);
  if (
    skills.length === 0 &&
    !pendingTargetSkill &&
    !pendingChoiceSkill &&
    !pendingCardSkill &&
    !pendingCardPlayerSkill &&
    !pendingLayerSkill &&
    !pendingPlayerLayerSkill &&
    !pendingPlayerCardSkill &&
    !pendingMultiCardSkill
  )
    return null;

  const handleClick = (skill: ActiveSkillDescriptor) => {
    if (skill.argKind === 'none') {
      onInvoke(skill, []);
      return;
    }
    if (skill.argKind === 'targetPlayer') {
      setPendingTargetSkill(skill);
      return;
    }
    if (skill.argKind === 'choiceIncDec') {
      setPendingChoiceSkill(skill);
      return;
    }
    if (skill.argKind === 'handCard') {
      setPendingCardSkill(skill);
      return;
    }
    if (skill.argKind === 'cardAndPlayer') {
      setPendingCardPlayerSkill({ skill, card: null });
      return;
    }
    if (skill.argKind === 'targetLayer') {
      setPendingLayerSkill(skill);
      return;
    }
    if (skill.argKind === 'playerAndLayer') {
      setPendingPlayerLayerSkill({ skill, targetId: null });
      return;
    }
    if (skill.argKind === 'playerAndCard') {
      setPendingPlayerCardSkill({ skill, targetId: null });
      return;
    }
    if (skill.argKind === 'multiCard') {
      setPendingMultiCardSkill({ skill, selected: [] });
      return;
    }
  };

  const toggleMultiCard = (cardId: string) => {
    setPendingMultiCardSkill((prev) => {
      if (!prev) return prev;
      const idx = prev.selected.indexOf(cardId);
      if (idx >= 0) {
        const next = [...prev.selected];
        next.splice(idx, 1);
        return { ...prev, selected: next };
      }
      return { ...prev, selected: [...prev.selected, cardId] };
    });
  };

  const confirmMultiCard = () => {
    if (!pendingMultiCardSkill) return;
    onInvoke(pendingMultiCardSkill.skill, [pendingMultiCardSkill.selected]);
    setPendingMultiCardSkill(null);
  };

  const confirmPlayerCard = (cardId: string) => {
    if (!pendingPlayerCardSkill || !pendingPlayerCardSkill.targetId) return;
    onInvoke(pendingPlayerCardSkill.skill, [pendingPlayerCardSkill.targetId, cardId]);
    setPendingPlayerCardSkill(null);
  };

  const confirmLayer = (layer: number) => {
    if (!pendingLayerSkill) return;
    onInvoke(pendingLayerSkill, [layer]);
    setPendingLayerSkill(null);
  };

  const confirmPlayerLayer = (layer: number) => {
    if (!pendingPlayerLayerSkill || !pendingPlayerLayerSkill.targetId) return;
    onInvoke(pendingPlayerLayerSkill.skill, [pendingPlayerLayerSkill.targetId, layer]);
    setPendingPlayerLayerSkill(null);
  };

  const confirmCardPlayer = (targetId: string) => {
    if (!pendingCardPlayerSkill || !pendingCardPlayerSkill.card) return;
    onInvoke(pendingCardPlayerSkill.skill, [pendingCardPlayerSkill.card, targetId]);
    setPendingCardPlayerSkill(null);
  };

  const confirmCard = (cardId: string) => {
    if (!pendingCardSkill) return;
    onInvoke(pendingCardSkill, [cardId]);
    setPendingCardSkill(null);
  };

  const confirmTarget = (targetId: string) => {
    if (!pendingTargetSkill) return;
    onInvoke(pendingTargetSkill, [targetId]);
    setPendingTargetSkill(null);
  };

  const confirmChoice = (choice: 'increase' | 'decrease') => {
    if (!pendingChoiceSkill) return;
    onInvoke(pendingChoiceSkill, [choice]);
    setPendingChoiceSkill(null);
  };

  return (
    <div
      className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3"
      data-testid="active-skill-panel"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
        <Sparkles className="h-3 w-3" />
        {t('skill.panelTitle', { defaultValue: '角色技能' })}
      </div>

      {!pendingTargetSkill &&
        !pendingChoiceSkill &&
        !pendingCardSkill &&
        !pendingCardPlayerSkill &&
        !pendingLayerSkill &&
        !pendingPlayerLayerSkill &&
        !pendingPlayerCardSkill &&
        !pendingMultiCardSkill && (
          <div className="flex flex-wrap gap-2" data-testid="active-skill-buttons">
            {skills.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => handleClick(skill)}
                className={cn(
                  'rounded-full border border-primary/50 bg-background px-3 py-1 text-xs font-medium text-primary',
                  'transition-colors hover:bg-primary/10',
                )}
                data-testid={`active-skill-${skill.move}`}
                title={t(skill.descKey, { defaultValue: skill.id })}
              >
                {t(skill.nameKey, { defaultValue: skill.id })}
              </button>
            ))}
          </div>
        )}

      {pendingChoiceSkill && (
        <div className="space-y-2" data-testid="active-skill-choice-picker">
          <div className="text-xs text-muted-foreground">
            {t('skill.chooseDirection', { defaultValue: '选择方向：' })}
            <span className="ml-1 text-foreground">
              {t(pendingChoiceSkill.nameKey, { defaultValue: pendingChoiceSkill.id })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => confirmChoice('increase')}
              className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
              data-testid="active-skill-choice-increase"
            >
              {t('skill.choiceIncrease', { defaultValue: '+' })}
            </button>
            <button
              type="button"
              onClick={() => confirmChoice('decrease')}
              className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
              data-testid="active-skill-choice-decrease"
            >
              {t('skill.choiceDecrease', { defaultValue: '-' })}
            </button>
            <button
              type="button"
              onClick={() => setPendingChoiceSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-choice"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingCardSkill && (
        <div className="space-y-2" data-testid="active-skill-card-picker">
          <div className="text-xs text-muted-foreground">
            {t('skill.chooseHandCard', { defaultValue: '选择手牌：' })}
            <span className="ml-1 text-foreground">
              {t(pendingCardSkill.nameKey, { defaultValue: pendingCardSkill.id })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {context.hand.map((cardId, idx) => (
              <button
                key={`${cardId}-${idx}`}
                type="button"
                onClick={() => confirmCard(cardId)}
                className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                data-testid={`active-skill-card-${idx}`}
              >
                {cardId}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPendingCardSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-card"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingCardPlayerSkill && (
        <div className="space-y-2" data-testid="active-skill-card-player-picker">
          <div className="text-xs text-muted-foreground">
            {pendingCardPlayerSkill.card
              ? t('skill.chooseTarget', { defaultValue: '选择目标：' })
              : t('skill.chooseHandCard', { defaultValue: '选择手牌：' })}
            <span className="ml-1 text-foreground">
              {t(pendingCardPlayerSkill.skill.nameKey, {
                defaultValue: pendingCardPlayerSkill.skill.id,
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!pendingCardPlayerSkill.card &&
              context.hand.map((cardId, idx) => (
                <button
                  key={`${cardId}-${idx}`}
                  type="button"
                  onClick={() =>
                    setPendingCardPlayerSkill((prev) => (prev ? { ...prev, card: cardId } : prev))
                  }
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-cp-card-${idx}`}
                >
                  {cardId}
                </button>
              ))}
            {pendingCardPlayerSkill.card &&
              availableTargetIds.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => confirmCardPlayer(pid)}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-cp-target-${pid}`}
                >
                  {playerNicknames[pid] ?? pid}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setPendingCardPlayerSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-cp"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingMultiCardSkill && (
        <div className="space-y-2" data-testid="active-skill-multi-card-picker">
          <div className="text-xs text-muted-foreground">
            {t('skill.chooseMultiCards', { defaultValue: '多选手牌：' })}
            <span className="ml-1 text-foreground">
              {t(pendingMultiCardSkill.skill.nameKey, {
                defaultValue: pendingMultiCardSkill.skill.id,
              })}
            </span>
            <span className="ml-2 text-muted-foreground">
              ({pendingMultiCardSkill.selected.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {context.hand.map((cardId, idx) => {
              const active = pendingMultiCardSkill.selected.includes(cardId);
              return (
                <button
                  key={`${cardId}-${idx}`}
                  type="button"
                  onClick={() => toggleMultiCard(cardId)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs hover:border-primary',
                    active ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-muted',
                  )}
                  data-testid={`active-skill-mc-card-${idx}`}
                >
                  {cardId}
                </button>
              );
            })}
            <button
              type="button"
              onClick={confirmMultiCard}
              className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/80"
              data-testid="active-skill-confirm-mc"
              disabled={pendingMultiCardSkill.selected.length === 0}
            >
              {t('common.confirm', { defaultValue: '确认' })}
            </button>
            <button
              type="button"
              onClick={() => setPendingMultiCardSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-mc"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingPlayerCardSkill && (
        <div className="space-y-2" data-testid="active-skill-player-card-picker">
          <div className="text-xs text-muted-foreground">
            {pendingPlayerCardSkill.targetId
              ? t('skill.chooseHandCard', { defaultValue: '选择手牌：' })
              : t('skill.chooseTarget', { defaultValue: '选择目标：' })}
            <span className="ml-1 text-foreground">
              {t(pendingPlayerCardSkill.skill.nameKey, {
                defaultValue: pendingPlayerCardSkill.skill.id,
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!pendingPlayerCardSkill.targetId &&
              availableTargetIds.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() =>
                    setPendingPlayerCardSkill((prev) => (prev ? { ...prev, targetId: pid } : prev))
                  }
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-pc-target-${pid}`}
                >
                  {playerNicknames[pid] ?? pid}
                </button>
              ))}
            {pendingPlayerCardSkill.targetId &&
              context.hand.map((cardId, idx) => (
                <button
                  key={`${cardId}-${idx}`}
                  type="button"
                  onClick={() => confirmPlayerCard(cardId)}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-pc-card-${idx}`}
                >
                  {cardId}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setPendingPlayerCardSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-pc"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingPlayerLayerSkill && (
        <div className="space-y-2" data-testid="active-skill-player-layer-picker">
          <div className="text-xs text-muted-foreground">
            {pendingPlayerLayerSkill.targetId
              ? t('skill.chooseLayer', { defaultValue: '选择层：' })
              : t('skill.chooseTarget', { defaultValue: '选择目标：' })}
            <span className="ml-1 text-foreground">
              {t(pendingPlayerLayerSkill.skill.nameKey, {
                defaultValue: pendingPlayerLayerSkill.skill.id,
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!pendingPlayerLayerSkill.targetId &&
              availableTargetIds.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() =>
                    setPendingPlayerLayerSkill((prev) => (prev ? { ...prev, targetId: pid } : prev))
                  }
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-pl-target-${pid}`}
                >
                  {playerNicknames[pid] ?? pid}
                </button>
              ))}
            {pendingPlayerLayerSkill.targetId &&
              [1, 2, 3, 4].map((layer) => (
                <button
                  key={layer}
                  type="button"
                  onClick={() => confirmPlayerLayer(layer)}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-pl-layer-${layer}`}
                >
                  {t('localMatch.layer', { defaultValue: '层' })} {layer}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setPendingPlayerLayerSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-pl"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingLayerSkill && (
        <div className="space-y-2" data-testid="active-skill-layer-picker">
          <div className="text-xs text-muted-foreground">
            {t('skill.chooseLayer', { defaultValue: '选择层：' })}
            <span className="ml-1 text-foreground">
              {t(pendingLayerSkill.nameKey, { defaultValue: pendingLayerSkill.id })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((layer) => (
              <button
                key={layer}
                type="button"
                onClick={() => confirmLayer(layer)}
                className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                data-testid={`active-skill-layer-${layer}`}
              >
                {t('localMatch.layer', { defaultValue: '层' })} {layer}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPendingLayerSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-layer"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingTargetSkill && (
        <div className="space-y-2" data-testid="active-skill-target-picker">
          <div className="text-xs text-muted-foreground">
            {t('skill.chooseTarget', { defaultValue: '选择目标：' })}
            <span className="ml-1 text-foreground">
              {t(pendingTargetSkill.nameKey, { defaultValue: pendingTargetSkill.id })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTargetIds.map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() => confirmTarget(pid)}
                className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                data-testid={`active-skill-target-${pid}`}
              >
                {playerNicknames[pid] ?? pid}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPendingTargetSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
