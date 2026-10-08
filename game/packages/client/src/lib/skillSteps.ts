// 分步表单：需要依次选几样东西的主动技能（手牌、玩家、层、一项选择、弃牌堆里的牌、梦魇附加参数）。
// 每种参数形态对应一张步骤表（STEP_FORMS）和一个参数拼装函数；各步骤的可选项来自技能描述符
// （activeSkills.ts 里的 targets / layerChoices / handPickable / discardPickable / choices），
// 后面的步骤可以读前面已选的内容（SkillPicks）。纯函数，界面组件只负责展示与收集点按。
//
// 参数拼装与引擎各 move 的入参一一对应，有真实引擎对账测试（skillEngineFlow.test.ts）：
//   multiCardAndPlayers  playLunaFullMoon(弃牌 id 列表, 复活的玩家列表)
//   optionalPlayer       playPiscesBlessing(复活的玩家 | null)
//   cardPlayerLayer      playGreenRayArrest(SHOOT 牌, 目标, 层)        界面先选牌、再选层、再选目标
//   layerAndChoice       useSagittariusHeartLock(层, +1 | -1)           界面先选增减、再选层
//   discardCard          playAquariusCoherence(弃牌堆里的牌)
//   playerAndMultiCard   useVenusMirrorWorld(目标, 弃牌 id 列表)
//   layerAndParams       masterActivateNightmare / useMarsKill(层[, 梦魇附加参数])

import { handCardsAt } from './handPick';
import { nightmareParamKind, type NightmareParamKind } from './nightmareParams';
import {
  EMPTY_PICKS,
  layerChoicesFor,
  pickableHandIndexes,
  targetIdsFor,
  type ActiveSkillArgKind,
  type ActiveSkillContext,
  type ActiveSkillDescriptor,
  type SkillChoice,
  type SkillPicks,
} from './activeSkills';

export type SkillStepSpec =
  | { readonly kind: 'handCards' }
  | { readonly kind: 'players'; readonly multi?: boolean; readonly optional?: boolean }
  | { readonly kind: 'layer' }
  | { readonly kind: 'choice' }
  | { readonly kind: 'discardCard' }
  | { readonly kind: 'nightmareParams' };

interface StepForm {
  readonly steps: readonly SkillStepSpec[];
  readonly build: (hand: readonly string[], picks: SkillPicks) => unknown[];
}

const STEP_FORMS: Partial<Record<ActiveSkillArgKind, StepForm>> = {
  multiCardAndPlayers: {
    steps: [{ kind: 'handCards' }, { kind: 'players', multi: true, optional: true }],
    build: (hand, p) => [handCardsAt(hand, p.cards), [...p.players]],
  },
  optionalPlayer: {
    steps: [{ kind: 'players', optional: true }],
    build: (_hand, p) => [p.players[0] ?? null],
  },
  cardPlayerLayer: {
    steps: [{ kind: 'handCards' }, { kind: 'layer' }, { kind: 'players' }],
    build: (hand, p) => [handCardsAt(hand, p.cards)[0], p.players[0], p.layer],
  },
  layerAndChoice: {
    steps: [{ kind: 'choice' }, { kind: 'layer' }],
    build: (_hand, p) => [p.layer, p.choice === 'increase' ? 1 : -1],
  },
  discardCard: {
    steps: [{ kind: 'discardCard' }],
    build: (_hand, p) => [p.discardCard],
  },
  playerAndMultiCard: {
    steps: [{ kind: 'players' }, { kind: 'handCards' }],
    build: (hand, p) => [p.players[0], handCardsAt(hand, p.cards)],
  },
  layerAndParams: {
    steps: [{ kind: 'layer' }, { kind: 'nightmareParams' }],
    build: (_hand, p) => (p.params === null ? [p.layer] : [p.layer, p.params]),
  },
};

/** 这个技能是不是走分步表单 */
export function isStepSkill(skill: Pick<ActiveSkillDescriptor, 'argKind'>): boolean {
  return STEP_FORMS[skill.argKind] !== undefined;
}

/** 选好的层上那张梦魇要不要附加参数；看不到梦魇是什么（盗梦者视图）按不需要处理 */
export function nightmareKindAt(ctx: ActiveSkillContext, layer: number | null): NightmareParamKind {
  return layer === null ? 'none' : nightmareParamKind(ctx.layers?.[layer]?.nightmareId);
}

/**
 * 当前要走的步骤：梦魇不需要附加参数时，参数步骤自动省掉。
 * 参数步骤取决于已选的层，所以要带上 picks。
 */
export function stepsFor(
  skill: Pick<ActiveSkillDescriptor, 'argKind'>,
  ctx: ActiveSkillContext,
  picks: SkillPicks,
): readonly SkillStepSpec[] {
  const form = STEP_FORMS[skill.argKind];
  if (!form) return [];
  return form.steps.filter(
    (step) => step.kind !== 'nightmareParams' || nightmareKindAt(ctx, picks.layer) !== 'none',
  );
}

/** 该步骤的选择是「点一下就定」的：选了就进入下一步（最后一步则直接发动） */
export function isInstantStep(step: SkillStepSpec): boolean {
  switch (step.kind) {
    case 'layer':
    case 'choice':
    case 'discardCard':
      return true;
    case 'players':
      return !step.multi && !step.optional;
    case 'handCards':
    case 'nightmareParams':
      return false;
  }
}

/** 手牌步骤要选几张：描述符给了数量就刚好这么多，否则至少 1 张 */
export function handPickReady(
  skill: Pick<ActiveSkillDescriptor, 'pickCount'>,
  picked: number,
): boolean {
  return skill.pickCount !== undefined ? picked === skill.pickCount : picked > 0;
}

/** 这一步的选择是否已经完成，可以往下走 */
export function stepReady(
  step: SkillStepSpec,
  skill: ActiveSkillDescriptor,
  _ctx: ActiveSkillContext,
  picks: SkillPicks,
  paramsReady: boolean = true,
): boolean {
  switch (step.kind) {
    case 'handCards':
      return handPickReady(skill, picks.cards.length);
    case 'players':
      if (step.multi || step.optional) return true;
      return picks.players.length === 1;
    case 'layer':
      return picks.layer !== null;
    case 'choice':
      return picks.choice !== null;
    case 'discardCard':
      return picks.discardCard !== null;
    case 'nightmareParams':
      return paramsReady;
  }
}

/** 全部步骤都完成后拼出 move 的参数；还有没完成的步骤返回 null */
export function buildStepArgs(
  skill: ActiveSkillDescriptor,
  ctx: ActiveSkillContext,
  picks: SkillPicks,
  paramsReady: boolean = true,
): unknown[] | null {
  const form = STEP_FORMS[skill.argKind];
  if (!form) return null;
  const steps = stepsFor(skill, ctx, picks);
  if (!steps.every((step) => stepReady(step, skill, ctx, picks, paramsReady))) return null;
  return form.build(ctx.hand, picks);
}

// ---------------------------------------------------------------------------
// 各步骤的可选项
// ---------------------------------------------------------------------------

/** 手牌步骤：能选的手牌位置 */
export function handChoicesFor(skill: ActiveSkillDescriptor, ctx: ActiveSkillContext): number[] {
  return pickableHandIndexes(skill, ctx);
}

/** 玩家步骤：可选的玩家（描述符给了精确名单就用它，可以随已选内容变化） */
export function playerChoicesFor(
  skill: ActiveSkillDescriptor,
  ctx: ActiveSkillContext,
  picks: SkillPicks,
  aliveIds: readonly string[],
  lostIds: readonly string[],
): readonly string[] {
  return skill.targets?.(ctx, picks) ?? targetIdsFor(skill, ctx, aliveIds, lostIds);
}

/** 层步骤：可选的层 */
export function layerStepChoices(
  skill: ActiveSkillDescriptor,
  ctx: ActiveSkillContext,
  picks: SkillPicks,
): readonly number[] {
  return skill.layerChoices?.(ctx, picks.players[0] ?? null, picks) ?? layerChoicesFor(skill, ctx);
}

/** 弃牌堆步骤：可选的牌，同名只列一张并带上张数（引擎按牌 id 取，不分哪一张） */
export function discardChoicesFor(
  skill: ActiveSkillDescriptor,
  ctx: ActiveSkillContext,
): { readonly card: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const card of ctx.discardPile ?? []) {
    if (skill.discardPickable && !skill.discardPickable(card, ctx)) continue;
    counts.set(card, (counts.get(card) ?? 0) + 1);
  }
  return [...counts.entries()].map(([card, count]) => ({ card, count }));
}

/** 选一项步骤：选项 */
export function choicesFor(
  skill: ActiveSkillDescriptor,
  ctx: ActiveSkillContext,
): readonly SkillChoice[] {
  return skill.choices?.(ctx) ?? [];
}

// ---------------------------------------------------------------------------
// 选择的更新（不可变）
// ---------------------------------------------------------------------------

/** 一个步骤对应的已选内容清空后的样子 */
function clearStep(picks: SkillPicks, step: SkillStepSpec): SkillPicks {
  switch (step.kind) {
    case 'handCards':
      return { ...picks, cards: [] };
    case 'players':
      return { ...picks, players: [] };
    case 'layer':
      return { ...picks, layer: null };
    case 'choice':
      return { ...picks, choice: null };
    case 'discardCard':
      return { ...picks, discardCard: null };
    case 'nightmareParams':
      return { ...picks, params: null };
  }
}

/**
 * 回到第 index 步（含）重新选：这一步和之后各步的已选内容清空，之前的保留。
 * 后面的可选项取决于前面的选择（换了层，已选的目标可能不再合法），所以回退必须清掉后面的。
 */
export function clearFrom(
  steps: readonly SkillStepSpec[],
  index: number,
  picks: SkillPicks,
): SkillPicks {
  return steps.slice(index).reduce(clearStep, picks);
}

export { EMPTY_PICKS };
