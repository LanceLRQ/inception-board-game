// 主动技能元信息 + 可用性推导
// 对照：engine/abilities/characters/ + engine/skills.ts
//
// 仅处理"行动阶段可点按钮触发"的主动技能；被动技能由 dispatcher 自动触发
// R7 首批支持：
//   - 影子·潜伏 (thief_shade → playShadeFollow, 无参)
//   - 阿波罗·崇拜 (thief_apollo → playApolloWorship, 1 target)

export type ActiveSkillArgKind = 'none' | 'targetPlayer';

export interface ActiveSkillDescriptor {
  readonly id: string;
  readonly characterId: string;
  readonly move: string;
  /** i18n key for button label */
  readonly nameKey: string;
  /** i18n key for short help text */
  readonly descKey: string;
  readonly argKind: ActiveSkillArgKind;
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
}

export const SHADE_FOLLOW: ActiveSkillDescriptor = {
  id: 'thief_shade.skill_0',
  characterId: 'thief_shade',
  move: 'playShadeFollow',
  nameKey: 'skill.thief_shade.skill_0.name',
  descKey: 'skill.thief_shade.skill_0.desc',
  argKind: 'none',
  extraCheck: (ctx) => {
    // 梦主在迷失层（0）不能跟随 + 已同层不用跟
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

const ALL_DESCRIPTORS: readonly ActiveSkillDescriptor[] = [SHADE_FOLLOW, APOLLO_WORSHIP];

/** 推导当前人类玩家可见的主动技能列表 */
export function getAvailableActiveSkills(ctx: ActiveSkillContext): ActiveSkillDescriptor[] {
  if (!ctx.isHumanTurn) return [];
  if (!ctx.isAlive) return [];
  if (ctx.turnPhase !== 'action') return [];
  if (ctx.hasPending) return [];

  return ALL_DESCRIPTORS.filter((d) => {
    if (d.characterId !== ctx.characterId) return false;
    if (d.extraCheck && !d.extraCheck(ctx)) return false;
    return true;
  });
}
