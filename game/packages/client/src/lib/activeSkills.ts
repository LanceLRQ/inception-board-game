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
  | 'multiCard'
  | 'multiCardAndPlayer'
  | 'layerShiftPicks'
  | 'multiCardAndDiscardCard'
  | 'playerAndBribeIndex'
  | 'twoCardsAndShoot';

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
  /** 与人类玩家同层的其他存活玩家 id 列表（盖亚·大地用） */
  readonly sameLayerPlayerIds?: readonly string[];
  /** 弃牌堆（战争之王·黑市等选弃牌堆技能用） */
  readonly discardPile?: readonly string[];
  /** 贿赂池中仍 inPool 的项（皇城·重金用）：{ index, id } 对，id 带 deal/fail 标识 */
  readonly bribePoolItems?: readonly { readonly index: number; readonly id: string }[];
  /** 火星·战场世界观是否激活（= 当前梦主 = dm_mars_battlefield） */
  readonly marsBattlefieldActive?: boolean;
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

// R17：露娜·月蚀 —— 弃 2 张 SHOOT → 击杀同层任意玩家 → 翻面
// 对照：docs/manual/05-dream-thieves.md 露娜 + engine/game.ts playLunaEclipse
export const LUNA_ECLIPSE: ActiveSkillDescriptor = {
  id: 'thief_luna.skill_0',
  characterId: 'thief_luna',
  move: 'playLunaEclipse',
  nameKey: 'skill.thief_luna.skill_0.name',
  descKey: 'skill.thief_luna.skill_0.desc',
  argKind: 'multiCardAndPlayer',
  // 至少要 2 张手牌供挑选；SHOOT 类型校验交给 engine
  extraCheck: (ctx) => ctx.hand.length >= 2,
};

// R17：雅典娜·惊叹 —— 展示 4 张手牌 + 1 牌库顶 → 5 张同名击杀同层玩家
// 对照：docs/manual/05-dream-thieves.md 雅典娜 + engine/game.ts playAthenaAwe
export const ATHENA_AWE: ActiveSkillDescriptor = {
  id: 'thief_athena.skill_0',
  characterId: 'thief_athena',
  move: 'playAthenaAwe',
  nameKey: 'skill.thief_athena.skill_0.name',
  descKey: 'skill.thief_athena.skill_0.desc',
  argKind: 'multiCardAndPlayer',
  // 至少 4 张手牌才能参与展示
  extraCheck: (ctx) => ctx.hand.length >= 4,
};

// R24：欺诈师·盗心（单机盲抽版）—— 选 target + 选 1 张手牌还回
// 对照：docs/manual/05-dream-thieves.md 欺诈师 + engine/game.ts playForgerExchangeSingle
// 从 target 抽取的卡由服务端 Random.Die 随机挑，保护隐藏信息；回合限 1 次。
export const FORGER_EXCHANGE: ActiveSkillDescriptor = {
  id: 'thief_forger.skill_0',
  characterId: 'thief_forger',
  move: 'playForgerExchangeSingle',
  nameKey: 'skill.thief_forger.skill_0.name',
  descKey: 'skill.thief_forger.skill_0.desc',
  argKind: 'playerAndCard',
  extraCheck: (ctx) => {
    const used = ctx.skillUsedThisTurn['thief_forger.skill_0'] ?? 0;
    return used < 1 && ctx.hand.length > 0;
  },
};

// R23：天秤·平衡 step 1 —— bonder 选 target；后续 split + pick 由 worker 自动补完
// 对照：docs/manual/05-dream-thieves.md 天秤 + engine/game.ts playLibraBalance
// 单机模式简化：engine 放宽 ctx.currentPlayer guard，worker 自动代 target 对半分
// + 代 bonder 挑大堆（包括人类 bonder）；保证流程不卡死。
export const LIBRA_BALANCE: ActiveSkillDescriptor = {
  id: 'thief_libra.skill_0',
  characterId: 'thief_libra',
  move: 'playLibraBalance',
  nameKey: 'skill.thief_libra.skill_0.name',
  descKey: 'skill.thief_libra.skill_0.desc',
  argKind: 'targetPlayer',
  extraCheck: (ctx) => {
    // 回合限 1 次 + 至少 1 张手牌
    const used = ctx.skillUsedThisTurn['thief_libra.skill_0'] ?? 0;
    return used < 1 && ctx.hand.length > 0;
  },
};

// R21：火星·战场世界观 —— 弃 2 张非 SHOOT 手牌 → 从弃牌堆取 1 张 SHOOT
// 对照：cards-data.json dm_mars_battlefield 世界观 + engine/game.ts useMarsBattlefield
// 世界观激活时对所有存活玩家可用，SHOOT 类筛选交由 engine 精校
export const MARS_BATTLEFIELD_EXCHANGE: ActiveSkillDescriptor = {
  id: '__any__.mars_battlefield_exchange',
  characterId: '__any__',
  move: 'useMarsBattlefield',
  nameKey: 'skill.dm_mars_battlefield.world.name',
  descKey: 'skill.dm_mars_battlefield.world.desc',
  argKind: 'twoCardsAndShoot',
  extraCheck: (ctx) =>
    ctx.marsBattlefieldActive === true &&
    ctx.hand.length >= 2 &&
    (ctx.discardPile?.length ?? 0) > 0,
};

// R20：皇城·重金 —— 梦主指定池中 1 张贿赂派给盗梦者（替代随机抽）
// 对照：cards-data.json dm_imperial_city + engine/game.ts masterDealBribeImperial
export const IMPERIAL_DEAL_BRIBE: ActiveSkillDescriptor = {
  id: 'dm_imperial_city.skill_0',
  characterId: 'dm_imperial_city',
  move: 'masterDealBribeImperial',
  nameKey: 'skill.dm_imperial_city.skill_0.name',
  descKey: 'skill.dm_imperial_city.skill_0.desc',
  argKind: 'playerAndBribeIndex',
  extraCheck: (ctx) => ctx.faction === 'master' && (ctx.bribePoolItems?.length ?? 0) > 0,
};

// R19：战争之王·黑市 —— 弃 2 张手牌 → 从弃牌堆取 1 张
// 对照：docs/manual/05-dream-thieves.md 战争之王 + engine/game.ts playLordOfWarBlackMarket
export const LORD_OF_WAR_BLACK_MARKET: ActiveSkillDescriptor = {
  id: 'thief_lord_of_war.skill_0',
  characterId: 'thief_lord_of_war',
  move: 'playLordOfWarBlackMarket',
  nameKey: 'skill.thief_lord_of_war.skill_0.name',
  descKey: 'skill.thief_lord_of_war.skill_0.desc',
  argKind: 'multiCardAndDiscardCard',
  extraCheck: (ctx) => {
    // 回合限 1 次 + 至少 2 张手牌 + 弃牌堆非空
    const used = ctx.skillUsedThisTurn['thief_lord_of_war.skill_0'] ?? 0;
    const discardLen = ctx.discardPile?.length ?? 0;
    return used < 1 && ctx.hand.length >= 2 && discardLen > 0;
  },
};

// R18：盖亚·大地 —— 使同层其他玩家各自 +1 / -1 层（限 2 次/回合）
// 对照：docs/manual/05-dream-thieves.md 盖亚 + engine/game.ts playGaiaShift
export const GAIA_SHIFT: ActiveSkillDescriptor = {
  id: 'thief_gaia.skill_0',
  characterId: 'thief_gaia',
  move: 'playGaiaShift',
  nameKey: 'skill.thief_gaia.skill_0.name',
  descKey: 'skill.thief_gaia.skill_0.desc',
  argKind: 'layerShiftPicks',
  extraCheck: (ctx) => {
    // 回合限 2 次 + 同层必须有其他存活玩家可选
    const used = ctx.skillUsedThisTurn['thief_gaia.skill_0'] ?? 0;
    const sameLayerCount = ctx.sameLayerPlayerIds?.length ?? 0;
    return used < 2 && sameLayerCount > 0;
  },
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
  // MASTER_DEAL_BRIBE / IMPERIAL_DEAL_BRIBE 已从主动技能注册表移除。
  // 规则约束：贿赂派发只能在盗梦者【梦境窥视】或打开金币金库的响应窗口触发，
  // 而非梦主回合主动发起。保留常量定义供未来响应窗口复用。
  // 对照：docs/manual/03-game-flow.md §贿赂&背叛者
  LUNA_ECLIPSE,
  ATHENA_AWE,
  GAIA_SHIFT,
  LORD_OF_WAR_BLACK_MARKET,
  MARS_BATTLEFIELD_EXCHANGE,
  LIBRA_BALANCE,
  FORGER_EXCHANGE,
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
