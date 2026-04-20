// 主动技能元信息 + 可用性推导
// 对照：engine/abilities/characters/ + engine/skills.ts
//
// 仅处理"行动阶段可点按钮触发"的主动技能；被动技能由 dispatcher 自动触发
// R7-R9 支持：
//   - 影子·潜伏 (thief_shade → playShadeFollow, 无参)
//   - 阿波罗·崇拜 (thief_apollo → playApolloWorship, 1 target)
//   - 穿行者·支助 (thief_tourist → playTouristAssist, 1 target)
//   - 殉道者·牺牲 (thief_martyr → playMartyrSacrifice, choice: increase/decrease)
//   - 药剂师·调剂 (thief_chemist → playChemistRefine, 1 handCard)
//   - 双子·协同 (thief_gemini → playGeminiSync, 无参，弃牌阶段)

export type ActiveSkillArgKind = 'none' | 'targetPlayer' | 'choiceIncDec' | 'handCard';

export interface ActiveSkillDescriptor {
  readonly id: string;
  readonly characterId: string;
  readonly move: string;
  /** i18n key for button label */
  readonly nameKey: string;
  /** i18n key for short help text */
  readonly descKey: string;
  readonly argKind: ActiveSkillArgKind;
  /** 要求的回合阶段（默认 'action'） */
  readonly requiredPhase?: 'action' | 'discard' | 'draw';
  /** 额外合法性约束（如"已经抽过牌 + 行动阶段 + 存活"） */
  readonly extraCheck?: (ctx: ActiveSkillContext) => boolean;
}

export interface ActiveSkillContext {
  readonly characterId: string;
  readonly turnPhase: string;
  readonly isHumanTurn: boolean;
  readonly isAlive: boolean;
  readonly humanLayer: number;
  readonly masterLayer: number;
  readonly hasPending: boolean; // pendingUnlock / pendingGraft 等
  readonly skillUsedThisTurn: Record<string, number>;
  readonly hand: readonly string[];
}

export const SHADE_FOLLOW: ActiveSkillDescriptor = {
  id: 'thief_shade.skill_0',
  characterId: 'thief_shade',
  move: 'playShadeFollow',
  nameKey: 'skill.thief_shade.skill_0.name',
  descKey: 'skill.thief_shade.skill_0.desc',
  argKind: 'none',
  extraCheck: (ctx) => {
    if (ctx.masterLayer < 1) return false;
    if (ctx.humanLayer === ctx.masterLayer) return false;
    return true;
  },
};

export const APOLLO_WORSHIP: ActiveSkillDescriptor = {
  id: 'thief_apollo.skill_0',
  characterId: 'thief_apollo',
  move: 'playApolloWorship',
  nameKey: 'skill.thief_apollo.skill_0.name',
  descKey: 'skill.thief_apollo.skill_0.desc',
  argKind: 'targetPlayer',
};

export const TOURIST_ASSIST: ActiveSkillDescriptor = {
  id: 'thief_tourist.skill_0',
  characterId: 'thief_tourist',
  move: 'playTouristAssist',
  nameKey: 'skill.thief_tourist.skill_0.name',
  descKey: 'skill.thief_tourist.skill_0.desc',
  argKind: 'targetPlayer',
  extraCheck: (ctx) => (ctx.skillUsedThisTurn['thief_tourist.skill_0'] ?? 0) < 1,
};

export const MARTYR_SACRIFICE: ActiveSkillDescriptor = {
  id: 'thief_martyr.skill_0',
  characterId: 'thief_martyr',
  move: 'playMartyrSacrifice',
  nameKey: 'skill.thief_martyr.skill_0.name',
  descKey: 'skill.thief_martyr.skill_0.desc',
  argKind: 'choiceIncDec',
};

export const CHEMIST_REFINE: ActiveSkillDescriptor = {
  id: 'thief_chemist.skill_0',
  characterId: 'thief_chemist',
  move: 'playChemistRefine',
  nameKey: 'skill.thief_chemist.skill_0.name',
  descKey: 'skill.thief_chemist.skill_0.desc',
  argKind: 'handCard',
  extraCheck: (ctx) => ctx.hand.length > 0,
};

export const GEMINI_SYNC: ActiveSkillDescriptor = {
  id: 'thief_gemini.skill_0',
  characterId: 'thief_gemini',
  move: 'playGeminiSync',
  nameKey: 'skill.thief_gemini.skill_0.name',
  descKey: 'skill.thief_gemini.skill_0.desc',
  argKind: 'none',
  requiredPhase: 'discard',
  extraCheck: (ctx) =>
    // 双子·协同：弃牌阶段且梦主层 > 己层
    ctx.masterLayer > ctx.humanLayer,
};

const ALL_DESCRIPTORS: readonly ActiveSkillDescriptor[] = [
  SHADE_FOLLOW,
  APOLLO_WORSHIP,
  TOURIST_ASSIST,
  MARTYR_SACRIFICE,
  CHEMIST_REFINE,
  GEMINI_SYNC,
];

/** 推导当前人类玩家可见的主动技能列表 */
export function getAvailableActiveSkills(ctx: ActiveSkillContext): ActiveSkillDescriptor[] {
  if (!ctx.isHumanTurn) return [];
  if (!ctx.isAlive) return [];
  if (ctx.hasPending) return [];

  return ALL_DESCRIPTORS.filter((d) => {
    if (d.characterId !== ctx.characterId) return false;
    const required = d.requiredPhase ?? 'action';
    if (ctx.turnPhase !== required) return false;
    if (d.extraCheck && !d.extraCheck(ctx)) return false;
    return true;
  });
}
