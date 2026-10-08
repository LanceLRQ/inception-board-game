// 分步表单：依次选手牌、玩家、层、一项选择、弃牌堆里的牌、梦魇附加参数的主动技能。
// 步骤顺序、每步的可选项与参数拼装在 lib/skillSteps.ts（纯函数，有真实引擎对账测试），这里只负责展示与收集点按。
// 「点一下就定」的步骤（层、选一项、弃牌堆里的牌、必选的单个玩家）选完自动进入下一步，最后一步选完直接发动；
// 需要凑数或可以不选的步骤（多选手牌、可不选的玩家）用「下一步 / 确认」按钮收尾。

import { useState } from 'react';
import { Ban, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { getCardName } from '../../lib/cards';
import { toggleHandPick } from '../../lib/handPick';
import {
  EMPTY_PICKS,
  type ActiveSkillContext,
  type ActiveSkillDescriptor,
  type SkillPicks,
  type SkillReason,
} from '../../lib/activeSkills';
import {
  EMPTY_NIGHTMARE_DRAFT,
  nightmareParamsOf,
  nightmareParamsReady,
  plagueCandidates,
  type NightmareParamDraft,
} from '../../lib/nightmareParams';
import {
  buildStepArgs,
  choicesFor,
  clearFrom,
  discardChoicesFor,
  handChoicesFor,
  isInstantStep,
  layerStepChoices,
  nightmareKindAt,
  playerChoicesFor,
  stepReady,
  stepsFor,
  type SkillStepSpec,
} from '../../lib/skillSteps';
import { NightmareParamsForm } from '../NightmareParamsForm';
import { CardPickLabel } from './CardPickLabel';

interface SkillStepFormProps {
  readonly skill: ActiveSkillDescriptor;
  readonly context: ActiveSkillContext;
  readonly aliveTargetIds: readonly string[];
  readonly lostTargetIds: readonly string[];
  readonly nicknames: Readonly<Record<string, string>>;
  readonly onInvoke: (skill: ActiveSkillDescriptor, args: unknown[]) => void;
  readonly onCancel: () => void;
}

const CHIP =
  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:border-primary';
const CHIP_OFF = 'border-border bg-muted';
const CHIP_ON = 'border-primary bg-primary/20 text-primary';
const BTN_PRIMARY =
  'rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_PLAIN =
  'rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted';

export function SkillStepForm({
  skill,
  context,
  aliveTargetIds,
  lostTargetIds,
  nicknames,
  onInvoke,
  onCancel,
}: SkillStepFormProps) {
  const { t } = useTranslation();
  const [picks, setPicks] = useState<SkillPicks>(EMPTY_PICKS);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<NightmareParamDraft>(EMPTY_NIGHTMARE_DRAFT);

  const steps = stepsFor(skill, context, picks);
  const stepAt = Math.min(index, steps.length - 1);
  const step = steps[stepAt]!;
  const paramKind = nightmareKindAt(context, picks.layer);
  const paramsReady = nightmareParamsReady(paramKind, draft);
  const nameOf = (id: string) => nicknames[id] ?? id;
  const skillName = t(skill.nameKey, { defaultValue: skill.id });
  const reasonText = (r: SkillReason) => t(r.key, r.params);

  /** 带上梦魇附加参数后的选择 */
  const complete = (p: SkillPicks): SkillPicks => ({
    ...p,
    params:
      nightmareKindAt(context, p.layer) === 'none'
        ? null
        : (nightmareParamsOf(nightmareKindAt(context, p.layer), draft) ?? null),
  });

  const finish = (p: SkillPicks) => {
    const args = buildStepArgs(skill, context, complete(p), paramsReady);
    if (args) onInvoke(skill, args);
  };

  /** 当前这一步选好了：最后一步就发动，否则进入下一步 */
  const advance = (next: SkillPicks) => {
    const nextSteps = stepsFor(skill, context, next);
    if (stepAt >= nextSteps.length - 1) finish(next);
    else setIndex(stepAt + 1);
  };

  /** 点一下就定的步骤：写入选择，清掉之后各步依赖它的内容，再前进 */
  const pickInstant = (patch: Partial<SkillPicks>) => {
    const next = clearFrom(steps, stepAt + 1, { ...picks, ...patch });
    setPicks(next);
    setDraft(EMPTY_NIGHTMARE_DRAFT);
    advance(next);
  };

  const goBack = () => {
    if (stepAt === 0) return;
    setPicks(clearFrom(steps, stepAt - 1, picks));
    setDraft(EMPTY_NIGHTMARE_DRAFT);
    setIndex(stepAt - 1);
  };

  const ready = stepReady(step, skill, context, picks, paramsReady);
  const isLast = stepAt >= steps.length - 1;

  const renderStep = (spec: SkillStepSpec) => {
    switch (spec.kind) {
      case 'handCards': {
        const options = handChoicesFor(skill, context);
        return (
          <div className="flex flex-wrap gap-2" data-testid="active-skill-step-cards">
            {options.map((idx) => {
              const on = picks.cards.includes(idx);
              return (
                <button
                  key={`${context.hand[idx]}-${idx}`}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPicks({
                      ...clearFrom(steps, stepAt + 1, picks),
                      cards: [...toggleHandPick(picks.cards, idx, skill.pickCount)],
                    })
                  }
                  className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
                  data-testid={`active-skill-step-card-${idx}`}
                >
                  {on && <Check className="size-3" aria-hidden />}
                  <CardPickLabel cardId={context.hand[idx]!} />
                </button>
              );
            })}
          </div>
        );
      }
      case 'players': {
        const ids = playerChoicesFor(skill, context, picks, aliveTargetIds, lostTargetIds);
        if (ids.length === 0) {
          return (
            <p className="text-[12px] text-muted-foreground" data-testid="active-skill-step-empty">
              {t('skill.step.noPlayers')}
            </p>
          );
        }
        return (
          <div className="flex flex-wrap gap-2" data-testid="active-skill-step-players">
            {ids.map((pid) => {
              const on = picks.players.includes(pid);
              return (
                <button
                  key={pid}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (isInstantStep(spec)) {
                      pickInstant({ players: [pid] });
                      return;
                    }
                    const players = spec.multi
                      ? on
                        ? picks.players.filter((x) => x !== pid)
                        : [...picks.players, pid]
                      : on
                        ? []
                        : [pid];
                    setPicks({ ...picks, players });
                  }}
                  className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
                  data-testid={`active-skill-step-player-${pid}`}
                >
                  {on && <Check className="size-3" aria-hidden />}
                  {nameOf(pid)}
                </button>
              );
            })}
          </div>
        );
      }
      case 'layer': {
        const layers = layerStepChoices(skill, context, picks);
        if (layers.length === 0) {
          return (
            <p className="text-[12px] text-muted-foreground" data-testid="active-skill-step-empty">
              {t('skill.step.noLayers')}
            </p>
          );
        }
        return (
          <div className="flex flex-wrap gap-2" data-testid="active-skill-step-layers">
            {layers.map((layer) => (
              <button
                key={layer}
                type="button"
                onClick={() => pickInstant({ layer })}
                className={cn(CHIP, CHIP_OFF)}
                data-testid={`active-skill-step-layer-${layer}`}
              >
                {t('localMatch.layer', { defaultValue: '层' })} {layer}
              </button>
            ))}
          </div>
        );
      }
      case 'choice':
        return (
          <div className="flex flex-wrap gap-2" data-testid="active-skill-step-choices">
            {choicesFor(skill, context).map((choice) => {
              const why = choice.disabled ? reasonText(choice.disabled) : null;
              return (
                <button
                  key={choice.value}
                  type="button"
                  aria-disabled={why !== null || undefined}
                  title={why ?? undefined}
                  onClick={() => {
                    if (why) toast.info(why);
                    else pickInstant({ choice: choice.value });
                  }}
                  className={cn(
                    CHIP,
                    CHIP_OFF,
                    why !== null && 'cursor-not-allowed opacity-60 hover:border-border',
                  )}
                  data-testid={`active-skill-step-choice-${choice.value}`}
                >
                  {why !== null && <Ban className="size-3 shrink-0" aria-hidden />}
                  {t(choice.labelKey)}
                </button>
              );
            })}
          </div>
        );
      case 'discardCard': {
        const options = discardChoicesFor(skill, context);
        return (
          <div className="flex flex-wrap gap-2" data-testid="active-skill-step-discard">
            {options.map(({ card, count }) => (
              <button
                key={card}
                type="button"
                onClick={() => pickInstant({ discardCard: card })}
                className={cn(CHIP, CHIP_OFF)}
                data-testid={`active-skill-step-discard-${card}`}
                title={getCardName(card)}
              >
                <CardPickLabel cardId={card} />
                {count > 1 && <span className="text-muted-foreground">×{count}</span>}
              </button>
            ))}
          </div>
        );
      }
      case 'nightmareParams': {
        const layer = picks.layer;
        const info = layer === null ? undefined : context.layers?.[layer];
        return (
          <NightmareParamsForm
            kind={paramKind}
            draft={draft}
            onChange={setDraft}
            candidates={plagueCandidates(
              info?.playersInLayer ?? [],
              context.players ?? {},
              context.dreamMasterID ?? '',
            )}
            poolCount={context.bribePoolItems?.length ?? 0}
            nicknameOf={nameOf}
            testIdPrefix="active-skill-nm"
          />
        );
      }
    }
  };

  const prompt = (() => {
    switch (step.kind) {
      case 'handCards':
        return skill.pickCount !== undefined
          ? t('skill.step.cards', { picked: picks.cards.length, need: skill.pickCount })
          : t('skill.step.cardsAny', { picked: picks.cards.length });
      case 'players':
        if (step.multi) return t('skill.step.playersMulti', { picked: picks.players.length });
        return step.optional ? t('skill.step.playerOptional') : t('skill.chooseTarget');
      case 'layer':
        return t('skill.chooseLayer');
      case 'choice':
        return t('skill.step.choice');
      case 'discardCard':
        return t('skill.chooseDiscardCard');
      case 'nightmareParams':
        return t('skill.step.nightmareParams');
    }
  })();

  return (
    <div className="space-y-2" data-testid="active-skill-step-form" data-step={step.kind}>
      <div className="text-xs text-muted-foreground">
        {prompt}
        <span className="ml-1 text-foreground">{skillName}</span>
        {steps.length > 1 && (
          <span className="ml-2" data-testid="active-skill-step-progress">
            {stepAt + 1}/{steps.length}
          </span>
        )}
      </div>
      {renderStep(step)}
      <div className="flex flex-wrap gap-2">
        {!isInstantStep(step) && (
          <button
            type="button"
            onClick={() => advance(picks)}
            disabled={!ready}
            className={BTN_PRIMARY}
            data-testid="active-skill-step-next"
          >
            {isLast
              ? t('common.confirm', { defaultValue: '确认' })
              : t('common.next', { defaultValue: '下一步' })}
          </button>
        )}
        {stepAt > 0 && (
          <button
            type="button"
            onClick={goBack}
            className={BTN_PLAIN}
            data-testid="active-skill-step-back"
          >
            {t('skill.step.back')}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className={BTN_PLAIN}
          data-testid="active-skill-step-cancel"
        >
          {t('common.cancel', { defaultValue: '取消' })}
        </button>
      </div>
    </div>
  );
}
