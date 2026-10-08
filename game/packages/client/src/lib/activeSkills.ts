// 主动技能元信息 + 可用性推导
// 对照：game-engine 的 engine/skills.ts
//
// 仅处理"行动阶段可点按钮触发"的主动技能；被动技能由引擎在对应时机自动结算。
// 每个描述符对应引擎里的一个 move；「可见」「可用」「可选目标 / 层 / 牌」都只读按座位裁剪的视图里
// 本人看得到的信息推导，界面只做提前置灰并说明原因，合法性判定仍在引擎。
//
// 三层判断：
//   extraCheck  结构性条件，不满足就不显示（阵营、阶段、没有手牌之类）
//   usage       次数限制：用完后仍显示，置灰并说明（键必须是引擎实际写入 skillUsedThisTurn / skillUsedThisGame 的键）
//   blocked     其他引擎必拒的情形：仍显示，置灰并说明

import { PLAYER_COUNT_CONFIGS, isShootClassCard } from '@icgame/game-engine';
import { shootCrossLayerAllowed } from '../components/TargetPlayerPickerDialog/logic';

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
  | 'twoCardsAndShoot'
  // 以下几种由 skillSteps.ts 的分步表单处理：按参数形态命名，步骤顺序见 STEP_FORMS
  | 'multiCardAndPlayers'
  | 'optionalPlayer'
  | 'cardPlayerLayer'
  | 'layerAndChoice'
  | 'discardCard'
  | 'playerAndMultiCard'
  | 'layerAndParams';

/** 技能此刻用不了的原因（i18n 键 + 参数） */
export interface SkillReason {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** 次数限制：key 是引擎写入的技能使用记录键 */
export interface SkillUsage {
  readonly key: string;
  /** 上限；随局面变化时给函数 */
  readonly limit: number | ((ctx: ActiveSkillContext) => number);
  /** turn（缺省）= 读 skillUsedThisTurn；game = 读 skillUsedThisGame */
  readonly scope?: 'turn' | 'game';
  /** 上限为 0（还没攒到发动机会）时的原因；不给就按「已用完」说明 */
  readonly noQuota?: SkillReason;
}

/**
 * 分步表单里已经选了什么（skillSteps.ts 的各步骤逐步填入）。
 * 后一步的可选项可以取决于前面的选择（格林射线：选了牌和层才列该层的目标），
 * 所以描述符里的 targets / layerChoices 可以读它。
 */
export interface SkillPicks {
  /** 选中的手牌位置（同名牌各算一张） */
  readonly cards: readonly number[];
  /** 选中的玩家 */
  readonly players: readonly string[];
  readonly layer: number | null;
  /** 二选一 / 多选一的取值（SkillChoice.value） */
  readonly choice: string | null;
  /** 弃牌堆里选中的牌 */
  readonly discardCard: string | null;
  /** 梦魇的附加参数（回音萦绕 / 邪念瘟疫）；不需要时为 null */
  readonly params: Readonly<Record<string, unknown>> | null;
}

export const EMPTY_PICKS: SkillPicks = {
  cards: [],
  players: [],
  layer: null,
  choice: null,
  discardCard: null,
  params: null,
};

/** 分步表单里「选一项」步骤的选项 */
export interface SkillChoice {
  readonly value: string;
  /** i18n 键 */
  readonly labelKey: string;
  /** 此刻选不了的原因；可选时为 null */
  readonly disabled: SkillReason | null;
}

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
  /** 结构性条件：不满足就不显示 */
  readonly extraCheck?: (ctx: ActiveSkillContext) => boolean;
  /** 次数限制：用完后置灰并说明 */
  readonly usage?: SkillUsage;
  /** 显示但引擎必拒的情形：返回原因则置灰 */
  readonly blocked?: (ctx: ActiveSkillContext) => SkillReason | null;
  /** 本回合还能发动几次（技能不限次数、次数由规则触发积累时给出；按钮上显示剩余次数） */
  readonly remaining?: (ctx: ActiveSkillContext) => number;
  /**
   * 目标玩家的范围：alive（缺省）= 除本人外的存活玩家；lost = 在迷失层的其他玩家
   * （灵魂牧师·拯救的目标必须已死亡）。只对声明了它的技能生效。
   */
  readonly targetScope?: 'alive' | 'lost';
  /** 精确的可选目标；返回 null 表示没有额外信息，退回 targetScope 的范围；分步表单里 picks 是已选内容 */
  readonly targets?: (ctx: ActiveSkillContext, picks?: SkillPicks) => readonly string[] | null;
  /** 可选的层（目标层、先选玩家再选层）；targetId 是已选的玩家，没有为 null；缺省 1–4 */
  readonly layerChoices?: (
    ctx: ActiveSkillContext,
    targetId: string | null,
    picks?: SkillPicks,
  ) => readonly number[];
  /** 手牌里哪些牌能被选作这个技能的代价 / 展示；缺省都能选 */
  readonly handPickable?: (card: string, ctx: ActiveSkillContext) => boolean;
  /** 多选手牌必须刚好选几张；缺省至少 1 张 */
  readonly pickCount?: number;
  /** 选手牌时的补充说明（i18n 键）：达尔文·淘汰的选牌顺序就是放回牌库的顺序 */
  readonly pickHintKey?: string;
  /** 弃牌堆里哪些牌能被选；缺省都能选 */
  readonly discardPickable?: (card: string, ctx: ActiveSkillContext) => boolean;
  /** 分步表单里「选一项」步骤的选项（射手·穿心：增加 / 减少） */
  readonly choices?: (ctx: ActiveSkillContext) => readonly SkillChoice[];
}

/** 一个技能可选的目标玩家：按描述符声明的范围，从存活目标与迷失层目标里取 */
export function targetIdsForSkill(
  skill: Pick<ActiveSkillDescriptor, 'targetScope'>,
  aliveIds: readonly string[],
  lostIds: readonly string[],
): readonly string[] {
  return skill.targetScope === 'lost' ? lostIds : aliveIds;
}

/** 视图里每名玩家公开的、技能推导要用的信息 */
export interface SkillPlayerInfo {
  readonly isAlive: boolean;
  readonly currentLayer: number;
  readonly bribeReceived: number;
  readonly handCount: number;
}

/** 视图里每一层公开的、技能推导要用的信息；nightmareId 只有梦主（和已翻开时）看得到 */
export interface SkillLayerInfo {
  readonly heartLockValue: number;
  readonly nightmareRevealed: boolean;
  readonly nightmareTriggered: boolean;
  readonly nightmareId: string | null;
  readonly playersInLayer: readonly string[];
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
  /** 本人座位 */
  readonly seat?: string;
  /** 本人是不是梦主座位；背叛者的阵营是 master，但座位不是梦主，梦主专属的技能对他不可用 */
  readonly isDreamMaster?: boolean;
  readonly dreamMasterID?: string;
  /** 梦主的角色（公开） */
  readonly masterCharacterId?: string;
  /** 各玩家公开的信息 */
  readonly players?: Readonly<Record<string, SkillPlayerInfo>>;
  /** 各层公开的信息 */
  readonly layers?: Readonly<Record<number, SkillLayerInfo>>;
  /** 皇城世界观下本人尚未用掉的 SHOOT 机会（公开） */
  readonly imperialShootCharges?: number;
  /** 牌库剩余张数（公开） */
  readonly deckCount?: number;
  /** 本回合的解封次数已用尽（含摩羯 / 水瓶豁免的判断，见 lib/unlockLimit.ts） */
  readonly unlockExhausted?: boolean;
  /** 是否持有贿赂牌（仅盗梦者相关） */
  readonly hasBribe?: boolean;
  /** 本回合成功解封次数（哈雷·冲击触发前提） */
  readonly successfulUnlocksThisTurn?: number;
  /** 贿赂池是否仍有可派发项（梦主派贿赂前提） */
  readonly bribePoolAvailable?: boolean;
  /** 在迷失层的其他玩家 id 列表（灵魂牧师·拯救用） */
  readonly lostPlayerIds?: readonly string[];
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
  /** 本回合已打出的牌（公开；水瓶·凝聚、金星·镜界复制据此判断） */
  readonly playedCards?: readonly string[];
}

// ---------------------------------------------------------------------------
// 推导用的小工具
// ---------------------------------------------------------------------------

const TRANSIT_CARD = 'action_dream_transit';
const UNLOCK_CARD = 'action_unlock';
const BASIC_SHOOT_CARD = 'action_shoot';

/** 本人是不是梦主座位；上下文没给就按阵营推 */
export function isMasterSeat(ctx: ActiveSkillContext): boolean {
  return ctx.isDreamMaster ?? ctx.faction === 'master';
}

const reason = (key: string, params?: Record<string, string | number>): SkillReason =>
  params ? { key: `skill.reason.${key}`, params } : { key: `skill.reason.${key}` };

/** 满足条件的存活盗梦者（对外身份：除梦主外的人，含背叛者），不含本人；上下文没给玩家信息时返回 null */
function outwardThieves(
  ctx: ActiveSkillContext,
  pred: (p: SkillPlayerInfo, id: string) => boolean = () => true,
): readonly string[] | null {
  const players = ctx.players;
  if (!players) return null;
  return Object.entries(players)
    .filter(([id, p]) => id !== ctx.seat && id !== ctx.dreamMasterID && p.isAlive && pred(p, id))
    .map(([id]) => id);
}

function countCards(cards: readonly string[], pred: (card: string) => boolean): number {
  return cards.filter(pred).length;
}

/** 相邻的梦境层（第 1 层与第 4 层不相邻；不含迷失层） */
function adjacentLayersOf(layer: number): number[] {
  return [layer - 1, layer + 1].filter((l) => l >= 1 && l <= 4);
}

/** 满足条件的层号（升序） */
function layerKeys(ctx: ActiveSkillContext, pred: (info: SkillLayerInfo) => boolean): number[] {
  return Object.entries(ctx.layers ?? {})
    .filter(([, info]) => pred(info))
    .map(([layer]) => Number(layer))
    .sort((a, b) => a - b);
}

/** 本回合已用次数与上限 */
export function skillUsage(
  skill: Pick<ActiveSkillDescriptor, 'usage'>,
  ctx: ActiveSkillContext,
): { used: number; limit: number } | null {
  const usage = skill.usage;
  if (!usage) return null;
  const limit = typeof usage.limit === 'function' ? usage.limit(ctx) : usage.limit;
  const record = usage.scope === 'game' ? ctx.skillUsedThisGame : ctx.skillUsedThisTurn;
  return { used: record?.[usage.key] ?? 0, limit };
}

// ---------------------------------------------------------------------------
// 盗梦者技能
// ---------------------------------------------------------------------------

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

// 阿波罗·崇拜：目标是存活的、收到过贿赂牌且手里有牌的盗梦者；回合限 1 次
// 对照：docs/manual/05-dream-thieves.md 阿波罗；引擎的 applyApolloWorship
export const APOLLO_WORSHIP: ActiveSkillDescriptor = {
  id: 'thief_apollo.skill_0',
  characterId: 'thief_apollo',
  move: 'playApolloWorship',
  nameKey: 'skill.thief_apollo.skill_0.name',
  descKey: 'skill.thief_apollo.skill_0.desc',
  argKind: 'targetPlayer',
  usage: { key: 'thief_apollo.skill_0', limit: 1 },
  targets: (ctx) => outwardThieves(ctx, (p) => p.bribeReceived > 0 && p.handCount > 0),
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

// 药剂师·调剂：弃 1 张手牌，从弃牌堆收 1 张梦境穿梭剂；回合限 2 次
export const CHEMIST_REFINE: ActiveSkillDescriptor = {
  id: 'thief_chemist.skill_0',
  characterId: 'thief_chemist',
  move: 'playChemistRefine',
  nameKey: 'skill.thief_chemist.skill_0.name',
  descKey: 'skill.thief_chemist.skill_0.desc',
  argKind: 'handCard',
  extraCheck: (ctx) => ctx.hand.length > 0,
  usage: { key: 'thief_chemist.skill_0', limit: 2 },
  blocked: (ctx) => (ctx.discardPile?.includes(TRANSIT_CARD) ? null : reason('noTransitInDiscard')),
};

// 药剂师·注射：弃 1 张梦境穿梭剂，令同层的另一名玩家移到相邻层；不限次数
// 对照：docs/manual/05-dream-thieves.md 药剂师；引擎的 applyChemistInject
export const CHEMIST_INJECT: ActiveSkillDescriptor = {
  id: 'thief_chemist.skill_1',
  characterId: 'thief_chemist',
  move: 'playChemistInject',
  nameKey: 'skill.thief_chemist.skill_1.name',
  descKey: 'skill.thief_chemist.skill_1.desc',
  argKind: 'playerAndLayer',
  targets: (ctx) => ctx.sameLayerPlayerIds ?? null,
  // 被注射的人从他当前所在层（与本人同层）移到相邻层
  layerChoices: (ctx) => adjacentLayersOf(ctx.humanLayer),
  blocked: (ctx) => (ctx.hand.includes(TRANSIT_CARD) ? null : reason('noTransitInHand')),
};

// 双子·命运：弃牌阶段，梦主所在层数字更大时掷骰、当层心锁 -2 后翻面；回合限 1 次，减少心锁算一次解封
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
  usage: { key: 'thief_gemini.skill_0', limit: 1 },
  blocked: (ctx) => (ctx.unlockExhausted ? reason('unlockLimit') : null),
};

// 双子·抉择（背面）：出牌阶段，梦主所在层数字更小时掷 2 颗骰、抽骰点和张数后翻面；回合限 1 次
// 翻面后玩家的角色 id 是 `<牌 id>_back`，技能按背面匹配；对照：docs/manual/05-dream-thieves.md 双子
export const GEMINI_CHOICE: ActiveSkillDescriptor = {
  id: 'thief_gemini.skill_1',
  characterId: 'thief_gemini_back',
  move: 'playGeminiChoice',
  nameKey: 'skill.thief_gemini.skill_1.name',
  descKey: 'skill.thief_gemini.skill_1.desc',
  argKind: 'none',
  extraCheck: (ctx) => ctx.humanLayer >= 1 && ctx.masterLayer < ctx.humanLayer,
  usage: { key: 'thief_gemini.skill_1', limit: 1 },
};

// 灵魂牧师·拯救：弃 1 张手牌，复活迷失层的一名玩家；回合限 2 次
export const PAPRIK_SALVATION: ActiveSkillDescriptor = {
  id: 'thief_paprik.skill_0',
  characterId: 'thief_paprik',
  move: 'playPaprikSalvation',
  nameKey: 'skill.thief_paprik.skill_0.name',
  descKey: 'skill.thief_paprik.skill_0.desc',
  argKind: 'cardAndPlayer',
  // 拯救的目标必须已死亡（引擎的 applyPaprikSalvation）；视图没给迷失层名单时不据此判断
  targetScope: 'lost',
  extraCheck: (ctx) =>
    ctx.hand.length > 0 && (ctx.lostPlayerIds === undefined || ctx.lostPlayerIds.length > 0),
  usage: { key: 'thief_paprik.skill_0', limit: 2 },
};

// 筑梦师·迷宫：弃 1 张 SHOOT 类牌，困住同层的另一名存活玩家；不限次数
export const ARCHITECT_MAZE: ActiveSkillDescriptor = {
  id: 'thief_architect.skill_0',
  characterId: 'thief_architect',
  move: 'playArchitectMaze',
  nameKey: 'skill.thief_architect.skill_0.name',
  descKey: 'skill.thief_architect.skill_0.desc',
  argKind: 'cardAndPlayer',
  extraCheck: (ctx) => ctx.hand.length > 0,
  targets: (ctx) => ctx.sameLayerPlayerIds ?? null,
  handPickable: (card) => isShootClassCard(card as never),
  blocked: (ctx) =>
    countCards(ctx.hand, (c) => isShootClassCard(c as never)) > 0 ? null : reason('noShootCard'),
};

// 达尔文·淘汰：抽牌库顶 2 张，再把 2 张手牌按任意顺序放回牌库顶；回合限 1 次
// 引擎是一步完成的 move：放回的 2 张从「抽牌后」的手牌里选，而新抽的 2 张在发出 move 之前
// 不在任何人的视图里，所以界面只能从现有手牌里选；选牌的先后就是放回的顺序（先选的在最顶）。
export const DARWIN_EVOLUTION: ActiveSkillDescriptor = {
  id: 'thief_darwin.skill_0',
  characterId: 'thief_darwin',
  move: 'playDarwinEvolution',
  nameKey: 'skill.thief_darwin.skill_0.name',
  descKey: 'skill.thief_darwin.skill_0.desc',
  argKind: 'multiCard',
  pickCount: 2,
  pickHintKey: 'skill.hint.darwinOrder',
  extraCheck: (ctx) => ctx.hand.length > 0,
  usage: { key: 'thief_darwin.skill_0', limit: 1 },
  blocked: (ctx) => {
    if (ctx.deckCount !== undefined && ctx.deckCount < 2) return reason('deckShort');
    return ctx.hand.length >= 2 ? null : reason('needTwoInHand');
  },
};

// 露娜·满月（背面）：弃 2 张非 SHOOT 类牌，把任意数量（可以是 0）已死亡的玩家复活到自己所在层，然后翻面；回合限 1 次
// 对照：docs/manual/05-dream-thieves.md 露娜 21-25 行；引擎的 applyLunaFullMoon
export const LUNA_FULL_MOON: ActiveSkillDescriptor = {
  id: 'thief_luna.skill_1',
  characterId: 'thief_luna_back',
  move: 'playLunaFullMoon',
  nameKey: 'skill.thief_luna.skill_1.name',
  descKey: 'skill.thief_luna.skill_1.desc',
  argKind: 'multiCardAndPlayers',
  extraCheck: (ctx) => ctx.humanLayer >= 1,
  usage: { key: 'thief_luna.skill_1', limit: 1 },
  pickCount: 2,
  handPickable: (card) => !isShootClassCard(card as never),
  // 复活的对象是已在迷失层的其他玩家；一个也不选就只翻面
  targetScope: 'lost',
  blocked: (ctx) =>
    countCards(ctx.hand, (c) => !isShootClassCard(c as never)) >= 2
      ? null
      : reason('needTwoNonShoot'),
};

// 双鱼·洗礼（背面）：移到数字更大的相邻层，并可以复活一名玩家到那一层，然后翻面；回合限 1 次，第 4 层无法发动
// 对照：docs/manual/05-dream-thieves.md 双鱼 52-60 行；引擎的 applyPiscesBlessing
export const PISCES_BLESSING: ActiveSkillDescriptor = {
  id: 'thief_pisces.skill_1',
  characterId: 'thief_pisces_back',
  move: 'playPiscesBlessing',
  nameKey: 'skill.thief_pisces.skill_1.name',
  descKey: 'skill.thief_pisces.skill_1.desc',
  argKind: 'optionalPlayer',
  extraCheck: (ctx) => ctx.humanLayer >= 1,
  usage: { key: 'thief_pisces.skill_1', limit: 1 },
  targetScope: 'lost',
  blocked: (ctx) => (ctx.humanLayer >= 4 ? reason('piscesTopLayer') : null),
};

/** 格林射线·缉捕要弃的梦境穿梭剂（引擎写死这一张） */
const GREEN_RAY_TRANSIT = TRANSIT_CARD;

// 格林射线·缉捕：弃 1 张梦境穿梭剂和 1 张 SHOOT 类牌，移到任意一层，再对那里的目标执行该 SHOOT 的效果；不限次数
// 参数顺序是 (SHOOT 牌, 目标, 层)，界面先选牌、再选层、再选该层的目标。
// 目标的范围与普通出牌的 SHOOT 一致：要求同层的牌只能选移动后同层的人，刺客之王不限层，木星·巅峰世界观可选相邻层。
// 对照：引擎的 playGreenRayArrest；SHOOT 的层数限制见 engine 的 violatesShootLayerLimit
export const GREEN_RAY_ARREST: ActiveSkillDescriptor = {
  id: 'thief_green_ray.skill_0',
  characterId: 'thief_green_ray',
  move: 'playGreenRayArrest',
  nameKey: 'skill.thief_green_ray.skill_0.name',
  descKey: 'skill.thief_green_ray.skill_0.desc',
  argKind: 'cardPlayerLayer',
  extraCheck: (ctx) => ctx.hand.length > 0,
  pickCount: 1,
  handPickable: (card) => isShootClassCard(card as never),
  layerChoices: (ctx, _targetId, picks) => {
    const card = picks ? greenRayShootCard(ctx, picks) : null;
    return [1, 2, 3, 4].filter(
      (layer) => card === null || greenRayTargets(ctx, card, layer).length > 0,
    );
  },
  targets: (ctx, picks) => {
    if (!picks || picks.layer === null) return null;
    const card = greenRayShootCard(ctx, picks);
    return card === null ? [] : greenRayTargets(ctx, card, picks.layer);
  },
  blocked: (ctx) => {
    if (!ctx.hand.includes(GREEN_RAY_TRANSIT)) return reason('noTransitInHand');
    return countCards(ctx.hand, (c) => isShootClassCard(c as never)) > 0
      ? null
      : reason('noShootCard');
  },
};

/** 已选的 SHOOT 牌（按手牌位置） */
function greenRayShootCard(ctx: ActiveSkillContext, picks: SkillPicks): string | null {
  const at = picks.cards[0];
  return at === undefined ? null : (ctx.hand[at] ?? null);
}

/** 移到 layer 层之后，这张 SHOOT 能打的人：存活的其他玩家，按牌的层数限制筛 */
function greenRayTargets(ctx: ActiveSkillContext, card: string, layer: number): string[] {
  const sameLayerOnly = card.startsWith('action_shoot') && card !== 'action_shoot_assassin';
  return Object.entries(ctx.players ?? {})
    .filter(([id, p]) => {
      if (id === ctx.seat || !p.isAlive) return false;
      if (!sameLayerOnly || p.currentLayer === layer) return true;
      return shootCrossLayerAllowed({
        viewerCharacterId: null,
        viewerLayer: layer,
        masterCharacterId: ctx.masterCharacterId,
        targetLayer: p.currentLayer,
      });
    })
    .map(([id]) => id);
}

/** 水瓶·凝聚的发动机会：本回合打出的牌里每 2 张同名牌一次 */
export function aquariusCoherencePairs(playedCards: readonly string[] | undefined): number {
  const counts = new Map<string, number>();
  for (const card of playedCards ?? []) counts.set(card, (counts.get(card) ?? 0) + 1);
  let pairs = 0;
  for (const n of counts.values()) pairs += Math.floor(n / 2);
  return pairs;
}

// 水瓶·凝聚：本回合每使用过 2 张同名牌，可从弃牌堆选 1 张本回合未使用过的牌收入手牌
// 发动机会 = 同名对数 - 已发动次数，两者都在公开的出牌记录与本人视图的使用记录里
// 对照：docs/manual/05-dream-thieves.md 水瓶 43-50 行；引擎的 availableAquariusCoherence / applyAquariusCoherence
export const AQUARIUS_COHERENCE: ActiveSkillDescriptor = {
  id: 'thief_aquarius.skill_0',
  characterId: 'thief_aquarius',
  move: 'playAquariusCoherence',
  nameKey: 'skill.thief_aquarius.skill_0.name',
  descKey: 'skill.thief_aquarius.skill_0.desc',
  argKind: 'discardCard',
  usage: {
    key: 'thief_aquarius.skill_0',
    limit: (ctx) => aquariusCoherencePairs(ctx.playedCards),
    noQuota: reason('needSameNamePair'),
  },
  discardPickable: (card, ctx) => !(ctx.playedCards ?? []).includes(card),
  blocked: (ctx) =>
    (ctx.discardPile ?? []).some((c) => AQUARIUS_COHERENCE.discardPickable!(c, ctx))
      ? null
      : reason('noFreshInDiscard'),
};

/** 与引擎的 SAGITTARIUS_KILLS_THIS_TURN_KEY 一致（有测试对账）：射手本回合击杀过几名玩家 */
export const SAGITTARIUS_KILLS_KEY = 'thief_sagittarius.kills';

/** 某一层心锁的原有数量（射手·穿心的上限）；人数没有对应配置时与引擎一样取 3 */
function originalHeartLocks(ctx: ActiveSkillContext, layer: number): number {
  const count = Object.keys(ctx.players ?? {}).length;
  return PLAYER_COUNT_CONFIGS[count]?.heartLocks[layer - 1] ?? 3;
}

// 射手·穿心：本回合击杀过玩家后，增加或减少任意一层的 1 个心锁，不能超过原有数量；回合限 1 次
// 减少心锁算一次解封：本回合解封次数用尽时只能增加。
// 对照：docs/manual/05-dream-thieves.md 射手 132-140 行；引擎的 canUseSagittariusHeartLock / applySagittariusHeartLock
export const SAGITTARIUS_HEART_LOCK: ActiveSkillDescriptor = {
  id: 'thief_sagittarius.skill_1',
  characterId: 'thief_sagittarius',
  move: 'useSagittariusHeartLock',
  nameKey: 'skill.thief_sagittarius.skill_1.name',
  descKey: 'skill.thief_sagittarius.skill_1.desc',
  argKind: 'layerAndChoice',
  usage: { key: 'thief_sagittarius.skill_1', limit: 1 },
  blocked: (ctx) =>
    (ctx.skillUsedThisTurn[SAGITTARIUS_KILLS_KEY] ?? 0) > 0 ? null : reason('noKillThisTurn'),
  choices: (ctx) => [
    { value: 'increase', labelKey: 'skill.choice.increaseLock', disabled: null },
    {
      value: 'decrease',
      labelKey: 'skill.choice.decreaseLock',
      disabled: ctx.unlockExhausted ? reason('unlockLimit') : null,
    },
  ],
  // 增加：现有心锁低于原有数量的层；减少：还有心锁的层（引擎对没有变化的选择也会接受，但没有意义）
  layerChoices: (ctx, _targetId, picks) =>
    [1, 2, 3, 4].filter((layer) => {
      const info = ctx.layers?.[layer];
      if (!info) return false;
      if (picks?.choice === 'decrease') return info.heartLockValue > 0;
      if (picks?.choice === 'increase') return info.heartLockValue < originalHeartLocks(ctx, layer);
      return true;
    }),
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
  // 没有成功解封过就不显示；解封过则每成功一次可触发一次，用完后置灰
  extraCheck: (ctx) => (ctx.successfulUnlocksThisTurn ?? 0) > 0,
  usage: { key: 'thief_haley.skill_0', limit: (ctx) => ctx.successfulUnlocksThisTurn ?? 0 },
};

// 露娜·月蚀 —— 弃 2 张基础 SHOOT → 击杀同层任意玩家 → 翻面；回合限 1 次
// 对照：docs/manual/05-dream-thieves.md 露娜 + 引擎的 applyLunaEclipse（只认 action_shoot）
export const LUNA_ECLIPSE: ActiveSkillDescriptor = {
  id: 'thief_luna.skill_0',
  characterId: 'thief_luna',
  move: 'playLunaEclipse',
  nameKey: 'skill.thief_luna.skill_0.name',
  descKey: 'skill.thief_luna.skill_0.desc',
  argKind: 'multiCardAndPlayer',
  extraCheck: (ctx) => ctx.hand.length >= 2,
  usage: { key: 'thief_luna.skill_0', limit: 1 },
  handPickable: (card) => card === BASIC_SHOOT_CARD,
  pickCount: 2,
  targets: (ctx) => ctx.sameLayerPlayerIds ?? null,
  blocked: (ctx) =>
    countCards(ctx.hand, (c) => c === BASIC_SHOOT_CARD) >= 2 ? null : reason('needTwoShoot'),
};

// 雅典娜·惊叹 —— 展示 4 张手牌 + 1 牌库顶 → 5 张互不同名击杀同层玩家；回合限 1 次
// 对照：docs/manual/05-dream-thieves.md 雅典娜 + 引擎的 applyAthenaAwe
export const ATHENA_AWE: ActiveSkillDescriptor = {
  id: 'thief_athena.skill_1',
  characterId: 'thief_athena',
  move: 'playAthenaAwe',
  nameKey: 'skill.thief_athena.skill_1.name',
  descKey: 'skill.thief_athena.skill_1.desc',
  argKind: 'multiCardAndPlayer',
  // 至少 4 张手牌才能参与展示
  extraCheck: (ctx) => ctx.hand.length >= 4,
  usage: { key: 'thief_athena.skill_1', limit: 1 },
  pickCount: 4,
  targets: (ctx) => ctx.sameLayerPlayerIds ?? null,
  blocked: (ctx) => (ctx.deckCount === 0 ? reason('deckEmpty') : null),
};

// 欺诈师·盗心（单机盲抽版）—— 选 target + 选 1 张手牌还回
// 对照：docs/manual/05-dream-thieves.md 欺诈师 + 引擎的 playForgerExchangeSingle
// 从 target 抽取的卡由服务端 Random.Die 随机挑，保护隐藏信息；回合限 1 次。目标手里必须有牌。
export const FORGER_EXCHANGE: ActiveSkillDescriptor = {
  id: 'thief_forger.skill_0',
  characterId: 'thief_forger',
  move: 'playForgerExchangeSingle',
  nameKey: 'skill.thief_forger.skill_0.name',
  descKey: 'skill.thief_forger.skill_0.desc',
  argKind: 'playerAndCard',
  extraCheck: (ctx) => ctx.hand.length > 0,
  usage: { key: 'thief_forger.skill_0', limit: 1 },
  targets: (ctx) => {
    const players = ctx.players;
    if (!players) return null;
    return Object.entries(players)
      .filter(([id, p]) => id !== ctx.seat && p.isAlive && p.handCount > 0)
      .map(([id]) => id);
  },
};

// 天秤·平衡 step 1 —— bonder 选 target；后续 split + pick 由 worker 自动补完
// 对照：docs/manual/05-dream-thieves.md 天秤 + 引擎的 playLibraBalance
// 单机模式简化：engine 放宽 ctx.currentPlayer guard，worker 自动代 target 对半分
// + 代 bonder 挑大堆（包括人类 bonder）；保证流程不卡死。回合限 1 次 + 至少 1 张手牌
export const LIBRA_BALANCE: ActiveSkillDescriptor = {
  id: 'thief_libra.skill_0',
  characterId: 'thief_libra',
  move: 'playLibraBalance',
  nameKey: 'skill.thief_libra.skill_0.name',
  descKey: 'skill.thief_libra.skill_0.desc',
  argKind: 'targetPlayer',
  extraCheck: (ctx) => ctx.hand.length > 0,
  usage: { key: 'thief_libra.skill_0', limit: 1 },
};

// 战争之王·黑市 —— 弃 2 张手牌 → 从弃牌堆取 1 张；回合限 1 次
// 对照：docs/manual/05-dream-thieves.md 战争之王 + 引擎的 playLordOfWarBlackMarket
export const LORD_OF_WAR_BLACK_MARKET: ActiveSkillDescriptor = {
  id: 'thief_lord_of_war.skill_0',
  characterId: 'thief_lord_of_war',
  move: 'playLordOfWarBlackMarket',
  nameKey: 'skill.thief_lord_of_war.skill_0.name',
  descKey: 'skill.thief_lord_of_war.skill_0.desc',
  argKind: 'multiCardAndDiscardCard',
  extraCheck: (ctx) => ctx.hand.length >= 2,
  usage: { key: 'thief_lord_of_war.skill_0', limit: 1 },
  pickCount: 2,
  blocked: (ctx) => ((ctx.discardPile?.length ?? 0) > 0 ? null : reason('discardEmpty')),
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
  // 同层必须有其他存活玩家可选
  extraCheck: (ctx) => (ctx.sameLayerPlayerIds?.length ?? 0) > 0,
  usage: { key: 'thief_gaia.skill_0', limit: 2 },
};

// 空间女王·造物：弃牌阶段把 1 张手牌放到牌库顶；不限次数
// 对照：docs/manual/05-dream-thieves.md 空间女王；引擎的 useSpaceQueenStashTop（只在回合主人自己的弃牌阶段接受）
export const SPACE_QUEEN_STASH: ActiveSkillDescriptor = {
  id: 'thief_space_queen.skill_1',
  characterId: 'thief_space_queen',
  move: 'useSpaceQueenStashTop',
  nameKey: 'skill.thief_space_queen.skill_1.name',
  descKey: 'skill.thief_space_queen.skill_1.desc',
  argKind: 'handCard',
  requiredPhase: 'discard',
  extraCheck: (ctx) => ctx.hand.length > 0,
};

// 黑洞·吸纳：出牌阶段，指定一个有存活玩家的相邻层，该层所有存活玩家移到本人所在层；回合限 1 次
// 对照：docs/manual/05-dream-thieves.md 黑洞；引擎的 applyBlackHoleAbsorb
export const BLACK_HOLE_ABSORB: ActiveSkillDescriptor = {
  id: 'thief_black_hole.skill_1',
  characterId: 'thief_black_hole',
  move: 'useBlackHoleAbsorb',
  nameKey: 'skill.thief_black_hole.skill_1.name',
  descKey: 'skill.thief_black_hole.skill_1.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) => ctx.humanLayer >= 1,
  usage: { key: 'thief_black_hole.skill_1', limit: 1 },
  layerChoices: (ctx) =>
    adjacentLayersOf(ctx.humanLayer).filter((layer) =>
      (ctx.layers?.[layer]?.playersInLayer ?? []).some((id) => ctx.players?.[id]?.isAlive),
    ),
  blocked: (ctx) =>
    BLACK_HOLE_ABSORB.layerChoices!(ctx, null).length > 0 ? null : reason('noAdjacentPlayers'),
};

// 土星·领地世界观：持贿赂的盗梦者出牌阶段免费移动到相邻层，每回合一次
// 对照：docs/manual/06-dream-master.md 土星·领地；引擎的 canSaturnFreeMove / applySaturnFreeMove
export const SATURN_FREE_MOVE: ActiveSkillDescriptor = {
  id: 'dm_saturn_territory.worldview',
  characterId: '__any__', // 任意角色，只要梦主是土星·领地且本人持有贿赂（背叛者对外也是盗梦者，同样可用）
  move: 'useSaturnFreeMove',
  nameKey: 'skill.dm_saturn_territory.worldview.name',
  descKey: 'skill.dm_saturn_territory.worldview.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) =>
    ctx.masterCharacterId === 'dm_saturn_territory' && !isMasterSeat(ctx) && ctx.hasBribe === true,
  usage: { key: 'dm_saturn_territory.worldview', limit: 1 },
  layerChoices: (ctx) => adjacentLayersOf(ctx.humanLayer),
};

// 皇城·世界观：收到过贿赂牌的玩家，每收到 1 张得 1 次机会，选一名没收到贿赂牌的盗梦者视为使用 1 张 SHOOT（掷骰 -3）
// 对照：docs/manual/06-dream-master.md 皇城；引擎的 applyImperialCityWorldShoot（不限层，机会用完为止）
export const IMPERIAL_WORLD_SHOOT: ActiveSkillDescriptor = {
  id: 'dm_imperial_city.worldview',
  characterId: '__any__',
  move: 'useImperialCityWorldShoot',
  nameKey: 'skill.dm_imperial_city.worldview.name',
  descKey: 'skill.dm_imperial_city.worldview.desc',
  argKind: 'targetPlayer',
  extraCheck: (ctx) =>
    ctx.masterCharacterId === 'dm_imperial_city' && (ctx.imperialShootCharges ?? 0) > 0,
  remaining: (ctx) => ctx.imperialShootCharges ?? 0,
  targets: (ctx) => outwardThieves(ctx, (p) => p.bribeReceived === 0),
};

// 火星·战场世界观 —— 弃 2 张非 SHOOT 手牌 → 从弃牌堆取 1 张 SHOOT 类
// 对照：docs/manual/06-dream-master.md 火星·战场 世界观 + 引擎的 applyMarsBattlefieldExchange
// 世界观激活时对所有存活玩家可用，不限次数
export const MARS_BATTLEFIELD_EXCHANGE: ActiveSkillDescriptor = {
  id: 'dm_mars_battlefield.worldview',
  characterId: '__any__',
  move: 'useMarsBattlefield',
  nameKey: 'skill.dm_mars_battlefield.worldview.name',
  descKey: 'skill.dm_mars_battlefield.worldview.desc',
  argKind: 'twoCardsAndShoot',
  extraCheck: (ctx) => ctx.marsBattlefieldActive === true && ctx.hand.length >= 2,
  handPickable: (card) => !isShootClassCard(card as never),
  discardPickable: (card) => isShootClassCard(card as never),
  blocked: (ctx) => {
    if (countCards(ctx.hand, (c) => !isShootClassCard(c as never)) < 2) {
      return reason('needTwoNonShoot');
    }
    return (ctx.discardPile ?? []).some((c) => isShootClassCard(c as never))
      ? null
      : reason('noShootInDiscard');
  },
};

// ---------------------------------------------------------------------------
// 梦主技能
// ---------------------------------------------------------------------------

export const URANUS_POWER: ActiveSkillDescriptor = {
  id: 'dm_uranus_firmament.skill_0',
  characterId: 'dm_uranus_firmament',
  move: 'useUranusPower',
  nameKey: 'skill.dm_uranus_firmament.skill_0.name',
  descKey: 'skill.dm_uranus_firmament.skill_0.desc',
  argKind: 'playerAndLayer',
  extraCheck: (ctx) => isMasterSeat(ctx),
  // 每有 1 张未派发的贿赂牌可发动 1 次；一张都不剩时一次也不能发动
  usage: { key: 'dm_uranus_firmament.skill_0', limit: (ctx) => ctx.bribePoolItems?.length ?? 0 },
  targets: (ctx) => outwardThieves(ctx),
  // 必须移到不同层，不能送迷失层
  layerChoices: (ctx, targetId) => {
    const from = targetId === null ? undefined : ctx.players?.[targetId]?.currentLayer;
    return [1, 2, 3, 4].filter((layer) => layer !== from);
  },
};

// 密道·传送：弃 1 张梦境穿梭剂，把任一存活盗梦者送到迷失层；回合限 2 次
export const SECRET_PASSAGE_TELEPORT: ActiveSkillDescriptor = {
  id: 'dm_secret_passage.skill_0',
  characterId: 'dm_secret_passage',
  move: 'playSecretPassageTeleport',
  nameKey: 'skill.dm_secret_passage.skill_0.name',
  descKey: 'skill.dm_secret_passage.skill_0.desc',
  argKind: 'playerAndCard',
  extraCheck: (ctx) => isMasterSeat(ctx),
  usage: { key: 'dm_secret_passage.skill_0', limit: 2 },
  targets: (ctx) => outwardThieves(ctx),
  handPickable: (card) => card === TRANSIT_CARD,
  blocked: (ctx) => (ctx.hand.includes(TRANSIT_CARD) ? null : reason('noTransitInHand')),
};

/** 已翻开且还在棋盘上的梦魇所在的层（梦主的视图里 nightmareId 可见） */
function revealedNightmareLayers(ctx: ActiveSkillContext): number[] {
  return layerKeys(ctx, (l) => l.nightmareRevealed && !l.nightmareTriggered);
}

export const MASTER_ACTIVATE_NIGHTMARE: ActiveSkillDescriptor = {
  id: '__any_master__.activate_nightmare',
  characterId: '__any__',
  move: 'masterActivateNightmare',
  nameKey: 'skill.master.activate_nightmare.name',
  descKey: 'skill.master.activate_nightmare.desc',
  // 选层之后，回音萦绕要再选层与方式，邪念瘟疫要点名派发贿赂牌（见 lib/nightmareParams.ts）
  argKind: 'layerAndParams',
  extraCheck: (ctx) => isMasterSeat(ctx),
  layerChoices: (ctx) => revealedNightmareLayers(ctx),
  blocked: (ctx) =>
    revealedNightmareLayers(ctx).length > 0 ? null : reason('noRevealedNightmare'),
};

export const MASTER_DISCARD_NIGHTMARE: ActiveSkillDescriptor = {
  id: '__any_master__.discard_nightmare',
  characterId: '__any__',
  move: 'masterDiscardNightmare',
  nameKey: 'skill.master.discard_nightmare.name',
  descKey: 'skill.master.discard_nightmare.desc',
  argKind: 'targetLayer',
  extraCheck: (ctx) => isMasterSeat(ctx),
  layerChoices: (ctx) => revealedNightmareLayers(ctx),
  blocked: (ctx) =>
    revealedNightmareLayers(ctx).length > 0 ? null : reason('noRevealedNightmare'),
};

// 火星·杀戮：弃 1 张【解封】，发动指定层的梦魇（无需翻开）；不限次数
export const MARS_KILL: ActiveSkillDescriptor = {
  id: 'dm_mars_battlefield.skill_0',
  characterId: 'dm_mars_battlefield',
  move: 'useMarsKill',
  nameKey: 'skill.dm_mars_battlefield.skill_0.name',
  descKey: 'skill.dm_mars_battlefield.skill_0.desc',
  argKind: 'layerAndParams',
  extraCheck: (ctx) => isMasterSeat(ctx),
  // 梦主的视图里每层未发动的梦魇都看得见
  layerChoices: (ctx) => layerKeys(ctx, (l) => l.nightmareId !== null),
  blocked: (ctx) => {
    if (!ctx.hand.includes(UNLOCK_CARD)) return reason('noUnlockCard');
    return MARS_KILL.layerChoices!(ctx, null).length > 0 ? null : reason('noNightmare');
  },
};

// 棋局·易位：不在技能面板里选参数，点了之后由对局界面打开金库交换弹窗（见 useMatchController 的 invoke）
// 对照：docs/manual/06-dream-master.md 棋局 + 引擎的 useChessTranspose（每局 2 次，至少 2 个未开金库）
export const CHESS_TRANSPOSE: ActiveSkillDescriptor = {
  id: 'dm_chess.skill_0',
  characterId: 'dm_chess',
  move: 'useChessTranspose',
  nameKey: 'skill.dm_chess.skill_0.name',
  descKey: 'skill.dm_chess.skill_0.desc',
  argKind: 'none',
  extraCheck: (ctx) => isMasterSeat(ctx),
  usage: { key: 'dm_chess.skill_0', limit: 2, scope: 'game' },
  blocked: (ctx) => ((ctx.unopenedVaults ?? 0) >= 2 ? null : reason('noVaultPair')),
};

// 冥王星·业火：弃 1 张手牌，令所有手牌不足 2 张的存活盗梦者各抽 2 张；不限次数，但必须有这样的人
export const PLUTO_BURNING: ActiveSkillDescriptor = {
  id: 'dm_pluto_hell.skill_0',
  characterId: 'dm_pluto_hell',
  move: 'usePlutoBurning',
  nameKey: 'skill.dm_pluto_hell.skill_0.name',
  descKey: 'skill.dm_pluto_hell.skill_0.desc',
  argKind: 'handCard',
  extraCheck: (ctx) => isMasterSeat(ctx) && ctx.hand.length > 0,
  blocked: (ctx) => {
    const lowHand = outwardThieves(ctx, (p) => p.handCount < 2);
    return lowHand !== null && lowHand.length === 0 ? reason('noPlutoTarget') : null;
  },
};

// 金星·重影：回合内展示牌库顶（张数 = 存活盗梦者数）与任意手牌，同名牌收入手牌；回合限 1 次
// 对照：docs/manual/06-dream-master.md 金星·镜界；引擎的 applyVenusDouble
export const VENUS_DOUBLE: ActiveSkillDescriptor = {
  id: 'dm_venus_mirror.skill_0',
  characterId: 'dm_venus_mirror',
  move: 'useVenusDouble',
  nameKey: 'skill.dm_venus_mirror.skill_0.name',
  descKey: 'skill.dm_venus_mirror.skill_0.desc',
  argKind: 'multiCard',
  extraCheck: (ctx) => isMasterSeat(ctx) && ctx.hand.length > 0,
  usage: { key: 'dm_venus_mirror.skill_0', limit: 1 },
};

/** 金星·镜界复制的牌：本回合最后一张 SHOOT 类牌或 KICK（引擎只复制这一张） */
export function venusMirrorSource(playedCards: readonly string[] | undefined): string | null {
  const mirrorable = (playedCards ?? []).filter(
    (c) => isShootClassCard(c as never) || c === 'action_kick',
  );
  return mirrorable[mirrorable.length - 1] ?? null;
}

// 金星·镜界世界观：弃 2 张牌，重复执行本回合内打出的最后一张 SHOOT 类牌 / KICK 的效果；每人每回合一次
// 对照：docs/manual/06-dream-master.md 金星·镜界 世界观；引擎的 applyVenusMirrorWorld（目标是任一存活的其他玩家）
export const VENUS_MIRROR_COPY: ActiveSkillDescriptor = {
  id: 'dm_venus_mirror.worldview',
  characterId: '__any__',
  move: 'useVenusMirrorWorld',
  nameKey: 'skill.dm_venus_mirror.worldview.name',
  descKey: 'skill.dm_venus_mirror.worldview.desc',
  argKind: 'playerAndMultiCard',
  extraCheck: (ctx) => ctx.masterCharacterId === 'dm_venus_mirror',
  usage: { key: 'dm_venus_mirror.worldview', limit: 1 },
  pickCount: 2,
  blocked: (ctx) => {
    if (venusMirrorSource(ctx.playedCards) === null) return reason('nothingToMirror');
    return ctx.hand.length >= 2 ? null : reason('needTwoInHand');
  },
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
  extraCheck: (ctx) => isMasterSeat(ctx) && fortressColdnessRemaining(ctx.skillUsedThisTurn) > 0,
  remaining: (ctx) => fortressColdnessRemaining(ctx.skillUsedThisTurn),
};

const ALL_DESCRIPTORS: readonly ActiveSkillDescriptor[] = [
  SHADE_FOLLOW,
  APOLLO_WORSHIP,
  TOURIST_ASSIST,
  MARTYR_SACRIFICE,
  CHEMIST_REFINE,
  CHEMIST_INJECT,
  GEMINI_SYNC,
  GEMINI_CHOICE,
  ARCHITECT_MAZE,
  PLUTO_BURNING,
  FORTRESS_COLDNESS,
  MARS_KILL,
  CHESS_TRANSPOSE,
  SATURN_FREE_MOVE,
  IMPERIAL_WORLD_SHOOT,
  MASTER_DISCARD_NIGHTMARE,
  PAPRIK_SALVATION,
  URANUS_POWER,
  MASTER_ACTIVATE_NIGHTMARE,
  SECRET_PASSAGE_TELEPORT,
  VENUS_DOUBLE,
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
  SPACE_QUEEN_STASH,
  BLACK_HOLE_ABSORB,
  LUNA_FULL_MOON,
  PISCES_BLESSING,
  GREEN_RAY_ARREST,
  AQUARIUS_COHERENCE,
  SAGITTARIUS_HEART_LOCK,
  VENUS_MIRROR_COPY,
];

/** 供对账测试遍历：所有主动技能描述符 */
export const ACTIVE_SKILL_DESCRIPTORS: readonly ActiveSkillDescriptor[] = ALL_DESCRIPTORS;

/** 面板里的一项：技能本身、此刻能否发动、不能发动的原因、剩余次数（没有次数概念为 null） */
export interface SkillEntry {
  readonly skill: ActiveSkillDescriptor;
  readonly enabled: boolean;
  readonly reason: SkillReason | null;
  readonly remaining: number | null;
}

/** 一个技能此刻可选的目标玩家：描述符给了精确名单就用它，否则按范围取存活 / 迷失层目标 */
export function targetIdsFor(
  skill: ActiveSkillDescriptor,
  ctx: ActiveSkillContext,
  aliveIds: readonly string[],
  lostIds: readonly string[],
): readonly string[] {
  return skill.targets?.(ctx) ?? targetIdsForSkill(skill, aliveIds, lostIds);
}

/** 一个技能此刻可选的层；描述符没声明就是 1–4 */
export function layerChoicesFor(
  skill: ActiveSkillDescriptor,
  ctx: ActiveSkillContext,
  targetId: string | null = null,
): readonly number[] {
  return skill.layerChoices?.(ctx, targetId) ?? [1, 2, 3, 4];
}

/** 手牌里能被这个技能选作代价 / 展示的位置（保留手牌里的原位置，同名牌各算一张） */
export function pickableHandIndexes(
  skill: ActiveSkillDescriptor,
  ctx: ActiveSkillContext,
): number[] {
  return ctx.hand.flatMap((card, i) =>
    !skill.handPickable || skill.handPickable(card, ctx) ? [i] : [],
  );
}

const NEEDS_TARGET: readonly ActiveSkillArgKind[] = [
  'targetPlayer',
  'cardAndPlayer',
  'playerAndLayer',
  'playerAndCard',
  'multiCardAndPlayer',
  'playerAndBribeIndex',
];

/** 推导当前人类玩家可见的主动技能项：该显示的都显示，此刻用不了的带原因 */
export function getSkillEntries(ctx: ActiveSkillContext): SkillEntry[] {
  if (!ctx.isHumanTurn) return [];
  if (!ctx.isAlive) return [];
  if (ctx.hasPending) return [];

  const entries: SkillEntry[] = [];
  for (const d of ALL_DESCRIPTORS) {
    // '__any__' 作为通配匹配任意 characterId（配合 extraCheck 做阵营过滤）
    if (d.characterId !== '__any__' && d.characterId !== ctx.characterId) continue;
    const required = d.requiredPhase ?? 'action';
    if (ctx.turnPhase !== required) continue;
    if (d.extraCheck && !d.extraCheck(ctx)) continue;

    const usage = skillUsage(d, ctx);
    let blockedBy: SkillReason | null = null;
    if (usage && usage.used >= usage.limit) {
      blockedBy =
        usage.limit === 0 && d.usage?.noQuota
          ? d.usage.noQuota
          : reason(d.usage?.scope === 'game' ? 'usedUpGame' : 'usedUp', usage);
    }
    if (!blockedBy && d.blocked) blockedBy = d.blocked(ctx);
    if (!blockedBy && NEEDS_TARGET.includes(d.argKind)) {
      const targets = d.targets?.(ctx);
      if (targets && targets.length === 0) blockedBy = reason('noTarget');
    }
    const explicit = d.remaining?.(ctx);
    const remaining = explicit ?? (usage ? Math.max(0, usage.limit - usage.used) : null);
    entries.push({ skill: d, enabled: blockedBy === null, reason: blockedBy, remaining });
  }
  return entries;
}

/** 推导当前人类玩家此刻能发动的主动技能列表（用不了的不含） */
export function getAvailableActiveSkills(ctx: ActiveSkillContext): ActiveSkillDescriptor[] {
  return getSkillEntries(ctx)
    .filter((e) => e.enabled)
    .map((e) => e.skill);
}
