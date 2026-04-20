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

export type ActiveSkillArgKind =
  | 'none'
  | 'targetPlayer'
  | 'choiceIncDec'
  | 'handCard'
  | 'cardAndPlayer'
  | 'targetLayer'
  | 'playerAndLayer'
  | 'playerAndCard'
  | 'multiCard';

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
  readonly faction: 'thief' | 'master';
  /** 是否持有贿赂牌（仅盗梦者相关） */
  readonly hasBribe?: boolean;
  /** 本回合成功解封次数（哈雷·冲击触发前提） */
  readonly successfulUnlocksThisTurn?: number;
  /** 贿赂池是否仍有可派发项（梦主派贿赂前提） */
  readonly bribePoolAvailable?: boolean;
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

export const PAPRIK_SALVATION: ActiveSkillDescriptor = {
  id: 'thief_paprik.skill_0',
  characterId: 'thief_paprik',
  move: 'playPaprikSalvation',
  nameKey: 'skill.thief_paprik.skill_0.name',
  descKey: 'skill.thief_paprik.skill_0.desc',
  argKind: 'cardAndPlayer',
  extraCheck: (ctx) => ctx.hand.length > 0,
};

export const URANUS_POWER: ActiveSkillDescriptor = {
  id: 'dm_uranus_firmament.skill_0',
  characterId: 'dm_uranus_firmament',
  move: 'useUranusPower',
  nameKey: 'skill.dm_uranus_firmament.skill_0.name',
  descKey: 'skill.dm_uranus_firmament.skill_0.desc',
  argKind: 'playerAndLayer',
  extraCheck: (ctx) => ctx.faction === 'master',
};

export const SECRET_PASSAGE_TELEPORT: ActiveSkillDescriptor = {
  id: '__any_master__.secret_passage_teleport',
  characterId: '__any__',
  move: 'playSecretPassageTeleport',
  nameKey: 'skill.master.secret_passage_teleport.name',
  descKey: 'skill.master.secret_passage_teleport.desc',
  argKind: 'playerAndCard',
  extraCheck: (ctx) =>
    ctx.faction === 'master' &&
    ctx.hand.length > 0 &&
    // 传送剂使用限 2/回合
    (ctx.skillUsedThisTurn['secret_passage_teleport'] ?? 0) < 2,
};

export const MASTER_DISCARD_HIDDEN_NIGHTMARE: ActiveSkillDescriptor = {
  id: '__any_master__.discard_hidden_nightmare',
  characterId: '__any__',
  move: 'masterDiscardHiddenNightmare',
  nameKey: 'skill.master.discard_hidden_nightmare.name',
  descKey: 'skill.master.discard_hidden_nightmare.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) => ctx.faction === 'master',
};

export const MASTER_ACTIVATE_NIGHTMARE: ActiveSkillDescriptor = {
  id: '__any_master__.activate_nightmare',
  characterId: '__any__',
  move: 'masterActivateNightmare',
  nameKey: 'skill.master.activate_nightmare.name',
  descKey: 'skill.master.activate_nightmare.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) => ctx.faction === 'master',
};

export const DARWIN_EVOLUTION: ActiveSkillDescriptor = {
  id: 'thief_darwin.skill_0',
  characterId: 'thief_darwin',
  move: 'playDarwinEvolution',
  nameKey: 'skill.thief_darwin.skill_0.name',
  descKey: 'skill.thief_darwin.skill_0.desc',
  argKind: 'multiCard',
  extraCheck: (ctx) => ctx.hand.length > 0,
};

export const ARCHITECT_MAZE: ActiveSkillDescriptor = {
  id: 'thief_architect.skill_0',
  characterId: 'thief_architect',
  move: 'playArchitectMaze',
  nameKey: 'skill.thief_architect.skill_0.name',
  descKey: 'skill.thief_architect.skill_0.desc',
  argKind: 'cardAndPlayer',
  extraCheck: (ctx) => ctx.hand.length > 0,
};

export const SATURN_FREE_MOVE: ActiveSkillDescriptor = {
  id: 'dm_saturn_territory.wv_free_move',
  characterId: '__any__', // 任意 thief 角色，只要持贿赂
  move: 'useSaturnFreeMove',
  nameKey: 'skill.dm_saturn_territory.free_move.name',
  descKey: 'skill.dm_saturn_territory.free_move.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) => ctx.faction === 'thief' && ctx.hasBribe === true,
};

export const MASTER_REVEAL_NIGHTMARE: ActiveSkillDescriptor = {
  id: '__any_master__.reveal_nightmare',
  characterId: '__any__',
  move: 'masterRevealNightmare',
  nameKey: 'skill.master.reveal_nightmare.name',
  descKey: 'skill.master.reveal_nightmare.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) => ctx.faction === 'master',
};

export const MASTER_DISCARD_NIGHTMARE: ActiveSkillDescriptor = {
  id: '__any_master__.discard_nightmare',
  characterId: '__any__',
  move: 'masterDiscardNightmare',
  nameKey: 'skill.master.discard_nightmare.name',
  descKey: 'skill.master.discard_nightmare.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) => ctx.faction === 'master',
};

export const MARS_KILL: ActiveSkillDescriptor = {
  id: 'dm_mars_battlefield.skill_0',
  characterId: 'dm_mars_battlefield',
  move: 'useMarsKill',
  nameKey: 'skill.dm_mars_battlefield.skill_0.name',
  descKey: 'skill.dm_mars_battlefield.skill_0.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) => ctx.faction === 'master',
};

export const PLUTO_BURNING: ActiveSkillDescriptor = {
  id: 'dm_pluto_hell.skill_0',
  characterId: 'dm_pluto_hell',
  move: 'usePlutoBurning',
  nameKey: 'skill.dm_pluto_hell.skill_0.name',
  descKey: 'skill.dm_pluto_hell.skill_0.desc',
  argKind: 'handCard',
  extraCheck: (ctx) => ctx.faction === 'master' && ctx.hand.length > 0,
};

// R16：哈雷·冲击 —— 每成功解封 1 次可触发 1 次，掷骰击杀 / 位移目标
// 对照：docs/manual/05-dream-thieves.md 哈雷 + engine/game.ts playHaleyImpact
export const HALEY_IMPACT: ActiveSkillDescriptor = {
  id: 'thief_haley.skill_0',
  characterId: 'thief_haley',
  move: 'playHaleyImpact',
  nameKey: 'skill.thief_haley.skill_0.name',
  descKey: 'skill.thief_haley.skill_0.desc',
  argKind: 'targetPlayer',
  extraCheck: (ctx) => {
    const unlocks = ctx.successfulUnlocksThisTurn ?? 0;
    const used = ctx.skillUsedThisTurn['thief_haley.skill_0'] ?? 0;
    // 每成功解封可触发 1 次，使用次数不得超过成功解封次数
    return unlocks > used;
  },
};

// R16：梦主·贿赂派发（所有梦主通用）—— 从贿赂池随机派 1 张给盗梦者
// 对照：docs/manual/03-game-flow.md 贿赂阶段 + engine/game.ts masterDealBribe
export const MASTER_DEAL_BRIBE: ActiveSkillDescriptor = {
  id: '__any_master__.deal_bribe',
  characterId: '__any__',
  move: 'masterDealBribe',
  nameKey: 'skill.master.deal_bribe.name',
  descKey: 'skill.master.deal_bribe.desc',
  argKind: 'targetPlayer',
  extraCheck: (ctx) => ctx.faction === 'master' && ctx.bribePoolAvailable === true,
};

const ALL_DESCRIPTORS: readonly ActiveSkillDescriptor[] = [
  SHADE_FOLLOW,
  APOLLO_WORSHIP,
  TOURIST_ASSIST,
  MARTYR_SACRIFICE,
  CHEMIST_REFINE,
  GEMINI_SYNC,
  ARCHITECT_MAZE,
  PLUTO_BURNING,
  MARS_KILL,
  SATURN_FREE_MOVE,
  MASTER_REVEAL_NIGHTMARE,
  MASTER_DISCARD_NIGHTMARE,
  PAPRIK_SALVATION,
  URANUS_POWER,
  MASTER_DISCARD_HIDDEN_NIGHTMARE,
  MASTER_ACTIVATE_NIGHTMARE,
  SECRET_PASSAGE_TELEPORT,
  DARWIN_EVOLUTION,
  HALEY_IMPACT,
  MASTER_DEAL_BRIBE,
];

/** 推导当前人类玩家可见的主动技能列表 */
export function getAvailableActiveSkills(ctx: ActiveSkillContext): ActiveSkillDescriptor[] {
  if (!ctx.isHumanTurn) return [];
  if (!ctx.isAlive) return [];
  if (ctx.hasPending) return [];

  return ALL_DESCRIPTORS.filter((d) => {
    // '__any__' 作为通配匹配任意 characterId（配合 extraCheck 做阵营过滤）
    if (d.characterId !== '__any__' && d.characterId !== ctx.characterId) return false;
    const required = d.requiredPhase ?? 'action';
    if (ctx.turnPhase !== required) return false;
    if (d.extraCheck && !d.extraCheck(ctx)) return false;
    return true;
  });
}
