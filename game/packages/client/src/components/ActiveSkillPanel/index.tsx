// 主动技能按钮面板 —— 行动阶段人类玩家可见
// 对照：client/src/lib/activeSkills.ts + game-engine 的 engine/skills.ts

import { useState } from 'react';
import { Ban, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getSkillEntries,
  layerChoicesFor,
  pickableHandIndexes,
  targetIdsFor,
  type ActiveSkillContext,
  type ActiveSkillDescriptor,
  type SkillEntry,
} from '../../lib/activeSkills';
import { toast } from '@/lib/toast';
import { getCardName } from '../../lib/cards';
import { getCardImageUrl } from '../../lib/cardImages';
import { toggleHandPick } from '../../lib/handPick';
import {
  multiCardArgs,
  multiCardDiscardArgs,
  multiCardPlayerArgs,
  twoCardsShootArgs,
} from './skillArgs';

/** picker 按钮内小缩略图 + 中文名。兼容原先纯文字布局：inline-flex 横向 */
function CardPickLabel({ cardId }: { cardId: string }) {
  const img = getCardImageUrl(cardId);
  return (
    <span className="inline-flex items-center gap-1.5">
      {img && (
        <img
          src={img}
          alt=""
          className="h-6 w-[16px] flex-shrink-0 rounded-sm object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <span>{getCardName(cardId)}</span>
    </span>
  );
}
import { cn } from '../../lib/utils';

interface ActiveSkillPanelProps {
  readonly context: ActiveSkillContext;
  /** 存活的可选目标 */
  readonly availableTargetIds: readonly string[];
  /** 在迷失层的玩家（灵魂牧师·拯救等以迷失层玩家为目标的技能用） */
  readonly lostTargetIds?: readonly string[];
  readonly playerNicknames: Record<string, string>;
  readonly onInvoke: (skill: ActiveSkillDescriptor, args: unknown[]) => void;
}

export function ActiveSkillPanel({
  context,
  availableTargetIds: aliveTargetIds,
  lostTargetIds = [],
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
  // multiCard: 多选手牌（按手牌位置记录，同名牌各算一张）
  const [pendingMultiCardSkill, setPendingMultiCardSkill] = useState<{
    skill: ActiveSkillDescriptor;
    selected: number[];
  } | null>(null);
  // multiCardAndPlayer: 先多选手牌再选目标玩家（露娜·月蚀 / 雅典娜·惊叹）
  const [pendingMultiCardPlayerSkill, setPendingMultiCardPlayerSkill] = useState<{
    skill: ActiveSkillDescriptor;
    selected: number[];
    phase: 'cards' | 'target';
  } | null>(null);
  // layerShiftPicks: 同层玩家每人 +1/-1（盖亚·大地）
  const [pendingLayerShiftSkill, setPendingLayerShiftSkill] = useState<{
    skill: ActiveSkillDescriptor;
    picks: Record<string, -1 | 1>;
  } | null>(null);
  // multiCardAndDiscardCard: 先多选手牌再从弃牌堆选 1 张（战争之王·黑市）
  const [pendingMultiCardDiscardSkill, setPendingMultiCardDiscardSkill] = useState<{
    skill: ActiveSkillDescriptor;
    selected: number[];
    phase: 'cards' | 'discard';
  } | null>(null);
  // playerAndBribeIndex: 先选目标玩家再选贿赂池 idx（皇城·重金）
  const [pendingPlayerBribeSkill, setPendingPlayerBribeSkill] = useState<{
    skill: ActiveSkillDescriptor;
    targetId: string | null;
  } | null>(null);
  // twoCardsAndShoot: 选 2 张手牌 → 选弃牌堆 SHOOT 1 张（火星·战场世界观）
  const [pendingTwoCardsShootSkill, setPendingTwoCardsShootSkill] = useState<{
    skill: ActiveSkillDescriptor;
    selected: number[];
    phase: 'cards' | 'shoot';
  } | null>(null);

  const entries = getSkillEntries(context);
  const targetsOf = (skill: ActiveSkillDescriptor) =>
    targetIdsFor(skill, context, aliveTargetIds, lostTargetIds);
  // 选牌类技能里能选的手牌位置（保留手牌里的原位置）
  const pickable = (skill: ActiveSkillDescriptor) => pickableHandIndexes(skill, context);
  const reasonText = (entry: SkillEntry) =>
    entry.reason ? t(entry.reason.key, entry.reason.params) : null;
  // 没有进入任何参数选择时才显示技能列表
  const idle =
    !pendingTargetSkill &&
    !pendingChoiceSkill &&
    !pendingCardSkill &&
    !pendingCardPlayerSkill &&
    !pendingLayerSkill &&
    !pendingPlayerLayerSkill &&
    !pendingPlayerCardSkill &&
    !pendingMultiCardSkill &&
    !pendingMultiCardPlayerSkill &&
    !pendingLayerShiftSkill &&
    !pendingMultiCardDiscardSkill &&
    !pendingPlayerBribeSkill &&
    !pendingTwoCardsShootSkill;
  if (entries.length === 0 && idle) return null;

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
    if (skill.argKind === 'multiCardAndPlayer') {
      setPendingMultiCardPlayerSkill({ skill, selected: [], phase: 'cards' });
      return;
    }
    if (skill.argKind === 'layerShiftPicks') {
      setPendingLayerShiftSkill({ skill, picks: {} });
      return;
    }
    if (skill.argKind === 'multiCardAndDiscardCard') {
      setPendingMultiCardDiscardSkill({ skill, selected: [], phase: 'cards' });
      return;
    }
    if (skill.argKind === 'playerAndBribeIndex') {
      setPendingPlayerBribeSkill({ skill, targetId: null });
      return;
    }
    if (skill.argKind === 'twoCardsAndShoot') {
      setPendingTwoCardsShootSkill({ skill, selected: [], phase: 'cards' });
      return;
    }
  };

  // 选牌一律按手牌位置记录（同名牌各算一张），发 move 时再换成牌 id（见 skillArgs.ts）
  const toggleMultiCard = (index: number) => {
    setPendingMultiCardSkill((prev) =>
      prev
        ? { ...prev, selected: [...toggleHandPick(prev.selected, index, prev.skill.pickCount)] }
        : prev,
    );
  };
  // 需要刚好选几张的技能（露娜 2、雅典娜 4、战争之王 2）凑够才能继续；其余至少 1 张
  const pickReady = (skill: ActiveSkillDescriptor, picked: number) =>
    skill.pickCount !== undefined ? picked === skill.pickCount : picked > 0;

  const confirmMultiCard = () => {
    if (!pendingMultiCardSkill) return;
    onInvoke(
      pendingMultiCardSkill.skill,
      multiCardArgs(context.hand, pendingMultiCardSkill.selected),
    );
    setPendingMultiCardSkill(null);
  };

  const toggleMultiCardPlayer = (index: number) => {
    setPendingMultiCardPlayerSkill((prev) => {
      if (!prev || prev.phase !== 'cards') return prev;
      return {
        ...prev,
        selected: [...toggleHandPick(prev.selected, index, prev.skill.pickCount)],
      };
    });
  };

  const advanceMultiCardPlayerToTarget = () => {
    setPendingMultiCardPlayerSkill((prev) =>
      prev && pickReady(prev.skill, prev.selected.length) ? { ...prev, phase: 'target' } : prev,
    );
  };

  const confirmMultiCardPlayer = (targetId: string) => {
    if (!pendingMultiCardPlayerSkill) return;
    onInvoke(
      pendingMultiCardPlayerSkill.skill,
      multiCardPlayerArgs(context.hand, pendingMultiCardPlayerSkill.selected, targetId),
    );
    setPendingMultiCardPlayerSkill(null);
  };

  const setLayerShiftPick = (pid: string, dir: -1 | 1) => {
    setPendingLayerShiftSkill((prev) => {
      if (!prev) return prev;
      const cur = prev.picks[pid];
      const nextPicks = { ...prev.picks };
      if (cur === dir) {
        // 再点同方向取消（不包含在 picks 中即表示不移动该玩家）
        delete nextPicks[pid];
      } else {
        nextPicks[pid] = dir;
      }
      return { ...prev, picks: nextPicks };
    });
  };

  const confirmLayerShift = () => {
    if (!pendingLayerShiftSkill) return;
    onInvoke(pendingLayerShiftSkill.skill, [pendingLayerShiftSkill.picks]);
    setPendingLayerShiftSkill(null);
  };

  const toggleMultiCardDiscard = (index: number) => {
    setPendingMultiCardDiscardSkill((prev) => {
      if (!prev || prev.phase !== 'cards') return prev;
      return {
        ...prev,
        selected: [...toggleHandPick(prev.selected, index, prev.skill.pickCount)],
      };
    });
  };

  const advanceMultiCardDiscard = () => {
    setPendingMultiCardDiscardSkill((prev) =>
      prev && pickReady(prev.skill, prev.selected.length) ? { ...prev, phase: 'discard' } : prev,
    );
  };

  const confirmMultiCardDiscard = (discardCardId: string) => {
    if (!pendingMultiCardDiscardSkill) return;
    onInvoke(
      pendingMultiCardDiscardSkill.skill,
      multiCardDiscardArgs(context.hand, pendingMultiCardDiscardSkill.selected, discardCardId),
    );
    setPendingMultiCardDiscardSkill(null);
  };

  const confirmPlayerBribe = (poolIndex: number) => {
    if (!pendingPlayerBribeSkill || !pendingPlayerBribeSkill.targetId) return;
    onInvoke(pendingPlayerBribeSkill.skill, [pendingPlayerBribeSkill.targetId, poolIndex]);
    setPendingPlayerBribeSkill(null);
  };

  const toggleTwoCardsShoot = (index: number) => {
    setPendingTwoCardsShootSkill((prev) => {
      if (!prev || prev.phase !== 'cards') return prev;
      // 最多 2 张
      return { ...prev, selected: [...toggleHandPick(prev.selected, index, 2)] };
    });
  };

  const advanceTwoCardsShoot = () => {
    setPendingTwoCardsShootSkill((prev) =>
      prev && prev.selected.length === 2 ? { ...prev, phase: 'shoot' } : prev,
    );
  };

  const confirmTwoCardsShoot = (shootCardId: string) => {
    if (!pendingTwoCardsShootSkill) return;
    // useMarsBattlefield 签名：discardCard1, discardCard2, targetShootCardId（三独立参数）
    const args = twoCardsShootArgs(context.hand, pendingTwoCardsShootSkill.selected, shootCardId);
    if (!args) return;
    onInvoke(pendingTwoCardsShootSkill.skill, args);
    setPendingTwoCardsShootSkill(null);
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

      {idle && (
        <div className="flex flex-wrap gap-2" data-testid="active-skill-buttons">
          {entries.map((entry) => {
            const { skill } = entry;
            const remaining = entry.remaining ?? 0;
            const name = t(skill.nameKey, { defaultValue: skill.id });
            const why = reasonText(entry);
            return (
              <button
                key={skill.id}
                type="button"
                aria-disabled={!entry.enabled || undefined}
                aria-label={why ? t('skill.disabledAria', { name, reason: why }) : undefined}
                onClick={() => {
                  if (entry.enabled) handleClick(skill);
                  else if (why) toast.info(why);
                }}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium coarse:min-h-11 coarse:min-w-11',
                  entry.enabled
                    ? 'border-primary/50 bg-background text-primary transition-colors hover:bg-primary/10'
                    : 'cursor-not-allowed border-border bg-transparent text-muted-foreground opacity-60',
                )}
                data-testid={`active-skill-${skill.move}`}
                data-skill-id={skill.id}
                title={why ?? t(skill.descKey, { defaultValue: skill.id })}
              >
                {!entry.enabled && <Ban className="size-3 shrink-0" aria-hidden />}
                {name}
                {entry.enabled && remaining > 1 && (
                  <span data-testid="active-skill-remaining"> ×{remaining}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {idle && entries.some((e) => !e.enabled) && (
        <ul
          className="mt-2 space-y-0.5 text-[11px] text-muted-foreground"
          data-testid="active-skill-reasons"
        >
          {entries
            .filter((e) => !e.enabled)
            .map((e) => (
              <li key={e.skill.id} data-testid={`active-skill-reason-${e.skill.move}`}>
                {t(e.skill.nameKey, { defaultValue: e.skill.id })}：{reasonText(e)}
              </li>
            ))}
        </ul>
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
            {pickable(pendingCardSkill)
              .map((idx) => [context.hand[idx]!, idx] as const)
              .map(([cardId, idx]) => (
                <button
                  key={`${cardId}-${idx}`}
                  type="button"
                  onClick={() => confirmCard(cardId)}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-card-${idx}`}
                >
                  <CardPickLabel cardId={cardId} />
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
              pickable(pendingCardPlayerSkill.skill)
                .map((idx) => [context.hand[idx]!, idx] as const)
                .map(([cardId, idx]) => (
                  <button
                    key={`${cardId}-${idx}`}
                    type="button"
                    onClick={() =>
                      setPendingCardPlayerSkill((prev) => (prev ? { ...prev, card: cardId } : prev))
                    }
                    className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                    data-testid={`active-skill-cp-card-${idx}`}
                  >
                    <CardPickLabel cardId={cardId} />
                  </button>
                ))}
            {pendingCardPlayerSkill.card &&
              targetsOf(pendingCardPlayerSkill.skill).map((pid) => (
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
            {pickable(pendingMultiCardSkill.skill).map((idx) => {
              const cardId = context.hand[idx]!;
              const active = pendingMultiCardSkill.selected.includes(idx);
              return (
                <button
                  key={`${cardId}-${idx}`}
                  type="button"
                  onClick={() => toggleMultiCard(idx)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs hover:border-primary',
                    active ? 'border-primary bg-primary/20 text-primary' : 'border-border bg-muted',
                  )}
                  data-testid={`active-skill-mc-card-${idx}`}
                >
                  <CardPickLabel cardId={cardId} />
                </button>
              );
            })}
            <button
              type="button"
              onClick={confirmMultiCard}
              className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/80"
              data-testid="active-skill-confirm-mc"
              disabled={
                !pickReady(pendingMultiCardSkill.skill, pendingMultiCardSkill.selected.length)
              }
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

      {pendingMultiCardPlayerSkill && (
        <div className="space-y-2" data-testid="active-skill-multi-card-player-picker">
          <div className="text-xs text-muted-foreground">
            {pendingMultiCardPlayerSkill.phase === 'cards'
              ? t('skill.chooseMultiCards', { defaultValue: '多选手牌：' })
              : t('skill.chooseTarget', { defaultValue: '选择目标：' })}
            <span className="ml-1 text-foreground">
              {t(pendingMultiCardPlayerSkill.skill.nameKey, {
                defaultValue: pendingMultiCardPlayerSkill.skill.id,
              })}
            </span>
            {pendingMultiCardPlayerSkill.phase === 'cards' && (
              <span className="ml-2 text-muted-foreground">
                ({pendingMultiCardPlayerSkill.selected.length})
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingMultiCardPlayerSkill.phase === 'cards' &&
              pickable(pendingMultiCardPlayerSkill.skill).map((idx) => {
                const cardId = context.hand[idx]!;
                const active = pendingMultiCardPlayerSkill.selected.includes(idx);
                return (
                  <button
                    key={`${cardId}-${idx}`}
                    type="button"
                    onClick={() => toggleMultiCardPlayer(idx)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs hover:border-primary',
                      active
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-muted',
                    )}
                    data-testid={`active-skill-mcp-card-${idx}`}
                  >
                    <CardPickLabel cardId={cardId} />
                  </button>
                );
              })}
            {pendingMultiCardPlayerSkill.phase === 'cards' && (
              <button
                type="button"
                onClick={advanceMultiCardPlayerToTarget}
                className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/80"
                data-testid="active-skill-next-mcp"
                disabled={
                  !pickReady(
                    pendingMultiCardPlayerSkill.skill,
                    pendingMultiCardPlayerSkill.selected.length,
                  )
                }
              >
                {t('common.next', { defaultValue: '下一步' })}
              </button>
            )}
            {pendingMultiCardPlayerSkill.phase === 'target' &&
              targetsOf(pendingMultiCardPlayerSkill.skill).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => confirmMultiCardPlayer(pid)}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-mcp-target-${pid}`}
                >
                  {playerNicknames[pid] ?? pid}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setPendingMultiCardPlayerSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-mcp"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingLayerShiftSkill && (
        <div className="space-y-2" data-testid="active-skill-layer-shift-picker">
          <div className="text-xs text-muted-foreground">
            {t('skill.chooseLayerShift', {
              defaultValue: '为同层玩家选择 +1/-1 层（可留空）：',
            })}
            <span className="ml-1 text-foreground">
              {t(pendingLayerShiftSkill.skill.nameKey, {
                defaultValue: pendingLayerShiftSkill.skill.id,
              })}
            </span>
          </div>
          <div className="space-y-1">
            {(context.sameLayerPlayerIds ?? []).map((pid) => {
              const cur = pendingLayerShiftSkill.picks[pid];
              return (
                <div key={pid} className="flex items-center gap-2 text-xs">
                  <span className="min-w-[3rem] text-muted-foreground">
                    {playerNicknames[pid] ?? pid}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLayerShiftPick(pid, -1)}
                    disabled={context.humanLayer - 1 < 1}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs hover:border-primary',
                      cur === -1
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-muted',
                    )}
                    data-testid={`active-skill-ls-${pid}-down`}
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayerShiftPick(pid, 1)}
                    disabled={context.humanLayer + 1 > 4}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs hover:border-primary',
                      cur === 1
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-muted',
                    )}
                    data-testid={`active-skill-ls-${pid}-up`}
                  >
                    +1
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmLayerShift}
              className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/80"
              data-testid="active-skill-confirm-ls"
            >
              {t('common.confirm', { defaultValue: '确认' })}
            </button>
            <button
              type="button"
              onClick={() => setPendingLayerShiftSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-ls"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingMultiCardDiscardSkill && (
        <div className="space-y-2" data-testid="active-skill-multi-card-discard-picker">
          <div className="text-xs text-muted-foreground">
            {pendingMultiCardDiscardSkill.phase === 'cards'
              ? t('skill.chooseMultiCards', { defaultValue: '多选手牌：' })
              : t('skill.chooseDiscardCard', { defaultValue: '从弃牌堆选 1 张：' })}
            <span className="ml-1 text-foreground">
              {t(pendingMultiCardDiscardSkill.skill.nameKey, {
                defaultValue: pendingMultiCardDiscardSkill.skill.id,
              })}
            </span>
            {pendingMultiCardDiscardSkill.phase === 'cards' && (
              <span className="ml-2 text-muted-foreground">
                ({pendingMultiCardDiscardSkill.selected.length})
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingMultiCardDiscardSkill.phase === 'cards' &&
              pickable(pendingMultiCardDiscardSkill.skill).map((idx) => {
                const cardId = context.hand[idx]!;
                const active = pendingMultiCardDiscardSkill.selected.includes(idx);
                return (
                  <button
                    key={`${cardId}-${idx}`}
                    type="button"
                    onClick={() => toggleMultiCardDiscard(idx)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs hover:border-primary',
                      active
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-muted',
                    )}
                    data-testid={`active-skill-mcd-card-${idx}`}
                  >
                    <CardPickLabel cardId={cardId} />
                  </button>
                );
              })}
            {pendingMultiCardDiscardSkill.phase === 'cards' && (
              <button
                type="button"
                onClick={advanceMultiCardDiscard}
                className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/80"
                data-testid="active-skill-next-mcd"
                disabled={
                  !pickReady(
                    pendingMultiCardDiscardSkill.skill,
                    pendingMultiCardDiscardSkill.selected.length,
                  )
                }
              >
                {t('common.next', { defaultValue: '下一步' })}
              </button>
            )}
            {pendingMultiCardDiscardSkill.phase === 'discard' &&
              (context.discardPile ?? [])
                .map((cardId, idx) => [cardId, idx] as const)
                .filter(
                  ([cardId]) =>
                    pendingMultiCardDiscardSkill.skill.discardPickable?.(cardId) ?? true,
                )
                .map(([cardId, idx]) => (
                  <button
                    key={`disc-${cardId}-${idx}`}
                    type="button"
                    onClick={() => confirmMultiCardDiscard(cardId)}
                    className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                    data-testid={`active-skill-mcd-disc-${idx}`}
                  >
                    <CardPickLabel cardId={cardId} />
                  </button>
                ))}
            <button
              type="button"
              onClick={() => setPendingMultiCardDiscardSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-mcd"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingPlayerBribeSkill && (
        <div className="space-y-2" data-testid="active-skill-player-bribe-picker">
          <div className="text-xs text-muted-foreground">
            {pendingPlayerBribeSkill.targetId
              ? t('skill.chooseBribe', { defaultValue: '选择贿赂：' })
              : t('skill.chooseTarget', { defaultValue: '选择目标：' })}
            <span className="ml-1 text-foreground">
              {t(pendingPlayerBribeSkill.skill.nameKey, {
                defaultValue: pendingPlayerBribeSkill.skill.id,
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!pendingPlayerBribeSkill.targetId &&
              targetsOf(pendingPlayerBribeSkill.skill).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() =>
                    setPendingPlayerBribeSkill((prev) => (prev ? { ...prev, targetId: pid } : prev))
                  }
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-pb-target-${pid}`}
                >
                  {playerNicknames[pid] ?? pid}
                </button>
              ))}
            {pendingPlayerBribeSkill.targetId &&
              (context.bribePoolItems ?? []).map((item) => (
                <button
                  key={`bribe-${item.index}`}
                  type="button"
                  onClick={() => confirmPlayerBribe(item.index)}
                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                  data-testid={`active-skill-pb-bribe-${item.index}`}
                  title={item.id}
                >
                  #{item.index}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setPendingPlayerBribeSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-pb"
            >
              {t('common.cancel', { defaultValue: '取消' })}
            </button>
          </div>
        </div>
      )}

      {pendingTwoCardsShootSkill && (
        <div className="space-y-2" data-testid="active-skill-two-cards-shoot-picker">
          <div className="text-xs text-muted-foreground">
            {pendingTwoCardsShootSkill.phase === 'cards'
              ? t('skill.chooseTwoNonShoot', {
                  defaultValue: '选 2 张非 SHOOT 手牌弃掉：',
                })
              : t('skill.chooseDiscardShoot', {
                  defaultValue: '从弃牌堆选 1 张 SHOOT：',
                })}
            <span className="ml-1 text-foreground">
              {t(pendingTwoCardsShootSkill.skill.nameKey, {
                defaultValue: pendingTwoCardsShootSkill.skill.id,
              })}
            </span>
            {pendingTwoCardsShootSkill.phase === 'cards' && (
              <span className="ml-2 text-muted-foreground">
                ({pendingTwoCardsShootSkill.selected.length}/2)
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingTwoCardsShootSkill.phase === 'cards' &&
              pickable(pendingTwoCardsShootSkill.skill).map((idx) => {
                const cardId = context.hand[idx]!;
                const active = pendingTwoCardsShootSkill.selected.includes(idx);
                return (
                  <button
                    key={`${cardId}-${idx}`}
                    type="button"
                    onClick={() => toggleTwoCardsShoot(idx)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs hover:border-primary',
                      active
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-muted',
                    )}
                    data-testid={`active-skill-tcs-card-${idx}`}
                  >
                    <CardPickLabel cardId={cardId} />
                  </button>
                );
              })}
            {pendingTwoCardsShootSkill.phase === 'cards' && (
              <button
                type="button"
                onClick={advanceTwoCardsShoot}
                className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/80"
                data-testid="active-skill-next-tcs"
                disabled={pendingTwoCardsShootSkill.selected.length !== 2}
              >
                {t('common.next', { defaultValue: '下一步' })}
              </button>
            )}
            {pendingTwoCardsShootSkill.phase === 'shoot' &&
              (context.discardPile ?? [])
                .map((cardId, idx) => [cardId, idx] as const)
                .filter(
                  ([cardId]) => pendingTwoCardsShootSkill.skill.discardPickable?.(cardId) ?? true,
                )
                .map(([cardId, idx]) => (
                  <button
                    key={`shoot-${cardId}-${idx}`}
                    type="button"
                    onClick={() => confirmTwoCardsShoot(cardId)}
                    className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                    data-testid={`active-skill-tcs-shoot-${idx}`}
                  >
                    <CardPickLabel cardId={cardId} />
                  </button>
                ))}
            <button
              type="button"
              onClick={() => setPendingTwoCardsShootSkill(null)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              data-testid="active-skill-cancel-tcs"
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
              targetsOf(pendingPlayerCardSkill.skill).map((pid) => (
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
              pickable(pendingPlayerCardSkill.skill)
                .map((idx) => [context.hand[idx]!, idx] as const)
                .map(([cardId, idx]) => (
                  <button
                    key={`${cardId}-${idx}`}
                    type="button"
                    onClick={() => confirmPlayerCard(cardId)}
                    className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary"
                    data-testid={`active-skill-pc-card-${idx}`}
                  >
                    <CardPickLabel cardId={cardId} />
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
              targetsOf(pendingPlayerLayerSkill.skill).map((pid) => (
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
              layerChoicesFor(
                pendingPlayerLayerSkill.skill,
                context,
                pendingPlayerLayerSkill.targetId,
              ).map((layer) => (
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
            {layerChoicesFor(pendingLayerSkill, context).map((layer) => (
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
            {targetsOf(pendingTargetSkill).map((pid) => (
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
