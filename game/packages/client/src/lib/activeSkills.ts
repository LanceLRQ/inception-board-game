// 主动技能元信息 + 可用性推导
// 对照：game-engine 的 engine/skills.ts
//
// 仅处理"行动阶段可点按钮触发"的主动技能；被动技能由引擎在对应时机自动结算
// 支持：
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
  /** 本回合还能发动几次（技能不限次数、次数由规则触发积累时给出；按钮上显示剩余次数） */
  readonly remaining?: (ctx: ActiveSkillContext) => number;
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
  /** 贿赂池中仍 inPool 的项（皇城·重金用）：{ index, id } 对；id 是不透明的标识，看不出成败 */
  readonly bribePoolItems?: readonly { readonly index: number; readonly id: string }[];
  /** 火星·战场世界观是否激活（= 当前梦主 = dm_mars_battlefield） */
  readonly marsBattlefieldActive?: boolean;
  /** 本人整局的技能使用次数（棋局·易位按整局限次） */
  readonly skillUsedThisGame?: Record<string, number>;
  /** 还没打开的金库数量（棋局·易位至少要 2 个） */
  readonly unopenedVaults?: number;
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
  // 不限次数；代价是交出全部手牌（至少 1 张）。对照：docs/manual/05-dream-thieves.md 穿行者
  extraCheck: (ctx) => ctx.hand.length > 0,
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
  id: 'dm_saturn_territory.worldview',
  characterId: '__any__', // 任意 thief 角色，只要持贿赂
  move: 'useSaturnFreeMove',
  nameKey: 'skill.dm_saturn_territory.worldview.name',
  descKey: 'skill.dm_saturn_territory.worldview.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) => ctx.faction === 'thief' && ctx.hasBribe === true,
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

// 棋局·易位：不在技能面板里选参数，点了之后由对局界面打开金库交换弹窗（见 useMatchController 的 invoke）
// 对照：docs/manual/06-dream-master.md 棋局 + 引擎的 useChessTranspose
export const CHESS_TRANSPOSE: ActiveSkillDescriptor = {
  id: 'dm_chess.skill_0',
  characterId: 'dm_chess',
  move: 'useChessTranspose',
  nameKey: 'skill.dm_chess.skill_0.name',
  descKey: 'skill.dm_chess.skill_0.desc',
  argKind: 'none',
  extraCheck: (ctx) =>
    ctx.faction === 'master' &&
    (ctx.skillUsedThisGame?.['dm_chess.skill_0'] ?? 0) < 2 &&
    (ctx.unopenedVaults ?? 0) >= 2,
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

// 要塞·冷酷：梦主在自己的出牌阶段每移动到另一层一次，可视为对任一盗梦者使用 1 张 SHOOT，不限次数
// 对照：docs/manual/06-dream-master.md 要塞 121 行 + 引擎的 useFortressColdness
// 剩余次数 = 换层次数 - 已发动次数，两个计数都在梦主本人视图的 skillUsedThisTurn 里（键与引擎一致，有测试对账）
export const FORTRESS_COLDNESS_CHANCES_KEY = 'dm_fortress.skill_0.chances';

/** 要塞·冷酷本回合还剩几次发动机会 */
export function fortressColdnessRemaining(
  skillUsedThisTurn: Readonly<Record<string, number>>,
): number {
  const chances = skillUsedThisTurn[FORTRESS_COLDNESS_CHANCES_KEY] ?? 0;
  const used = skillUsedThisTurn['dm_fortress.skill_0'] ?? 0;
  return Math.max(0, chances - used);
}

export const FORTRESS_COLDNESS: ActiveSkillDescriptor = {
  id: 'dm_fortress.skill_0',
  characterId: 'dm_fortress',
  move: 'useFortressColdness',
  nameKey: 'skill.dm_fortress.skill_0.name',
  descKey: 'skill.dm_fortress.skill_0.desc',
  argKind: 'targetPlayer',
  extraCheck: (ctx) =>
    ctx.faction === 'master' && fortressColdnessRemaining(ctx.skillUsedThisTurn) > 0,
  remaining: (ctx) => fortressColdnessRemaining(ctx.skillUsedThisTurn),
};

// 哈雷·冲击 —— 每成功解封 1 次可触发 1 次，掷骰击杀 / 位移目标
// 对照：docs/manual/05-dream-thieves.md 哈雷 + 引擎的 playHaleyImpact
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

// 露娜·月蚀 —— 弃 2 张 SHOOT → 击杀同层任意玩家 → 翻面
// 对照：docs/manual/05-dream-thieves.md 露娜 + 引擎的 playLunaEclipse
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

// 雅典娜·惊叹 —— 展示 4 张手牌 + 1 牌库顶 → 5 张同名击杀同层玩家
// 对照：docs/manual/05-dream-thieves.md 雅典娜 + 引擎的 playAthenaAwe
export const ATHENA_AWE: ActiveSkillDescriptor = {
  id: 'thief_athena.skill_1',
  characterId: 'thief_athena',
  move: 'playAthenaAwe',
  nameKey: 'skill.thief_athena.skill_1.name',
  descKey: 'skill.thief_athena.skill_1.desc',
  argKind: 'multiCardAndPlayer',
  // 至少 4 张手牌才能参与展示
  extraCheck: (ctx) => ctx.hand.length >= 4,
};

// 欺诈师·盗心（单机盲抽版）—— 选 target + 选 1 张手牌还回
// 对照：docs/manual/05-dream-thieves.md 欺诈师 + 引擎的 playForgerExchangeSingle
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

// 天秤·平衡 step 1 —— bonder 选 target；后续 split + pick 由 worker 自动补完
// 对照：docs/manual/05-dream-thieves.md 天秤 + 引擎的 playLibraBalance
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

// 火星·战场世界观 —— 弃 2 张非 SHOOT 手牌 → 从弃牌堆取 1 张 SHOOT
// 对照：docs/manual/06-dream-master.md 火星·战场 世界观 + 引擎的 useMarsBattlefield
// 世界观激活时对所有存活玩家可用，SHOOT 类筛选交由 engine 精校
export const MARS_BATTLEFIELD_EXCHANGE: ActiveSkillDescriptor = {
  id: 'dm_mars_battlefield.worldview',
  characterId: '__any__',
  move: 'useMarsBattlefield',
  nameKey: 'skill.dm_mars_battlefield.worldview.name',
  descKey: 'skill.dm_mars_battlefield.worldview.desc',
  argKind: 'twoCardsAndShoot',
  extraCheck: (ctx) =>
    ctx.marsBattlefieldActive === true &&
    ctx.hand.length >= 2 &&
    (ctx.discardPile?.length ?? 0) > 0,
};

// 战争之王·黑市 —— 弃 2 张手牌 → 从弃牌堆取 1 张
// 对照：docs/manual/05-dream-thieves.md 战争之王 + 引擎的 playLordOfWarBlackMarket
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

// 盖亚·大地 —— 使同层其他玩家各自 +1 / -1 层（限 2 次/回合）
// 对照：docs/manual/05-dream-thieves.md 盖亚 + 引擎的 playGaiaShift
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
  FORTRESS_COLDNESS,
  MARS_KILL,
  CHESS_TRANSPOSE,
  SATURN_FREE_MOVE,
  MASTER_DISCARD_NIGHTMARE,
  PAPRIK_SALVATION,
  URANUS_POWER,
  MASTER_ACTIVATE_NIGHTMARE,
  SECRET_PASSAGE_TELEPORT,
  DARWIN_EVOLUTION,
  HALEY_IMPACT,
  // 贿赂派发不是梦主主动发起的技能：只在盗梦者打开金币金库（金库三选一弹窗）
  // 或打出【梦境窥视】（派贿赂弹窗）时由梦主应答。
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
