// SHOOT 的共同结算：层数限制、死亡宣言、双鱼与恐怖分子的应答挂起、骰值修正链、命中后的处理。
// 意念判官·定罪与哈雷·冲击只改掷骰这一步，其余也走这里。

import type { CardID } from '@icgame/shared';
import { type ShootOutcome, resolveShootCustom } from '../dice.js';
import { killPlayer } from '../engine/death.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import {
  SCORPIUS_SKILL_ID,
  applyFortressWorldRoll,
  applyHaleyImpact,
  applyM4CarbineModifier,
  applyMercuryReverse,
  applyScorpiusPoison,
  applySudgerVerdict,
  applySoulSculptorCarve,
  applyTaurusHorn,
  canAriesStardustTrigger,
  canPiscesEvade,
  canUseSkill,
  findAliveAriesID,
  isCapricornusRhythmActive,
  isJupiterPeakLayerOK,
  isJupiterPeakWorldActive,
  isShootClassCard,
  isTerroristCrossLayerActive,
  markSkillUsed,
  settleVirgoPerfect,
  shouldJupiterThunderKill,
} from '../engine/skills.js';
import {
  type PlayerSetup,
  type SetupState,
  type ShootSkillSource,
  isCardlessShootSkill,
} from '../setup.js';
import { discardCard, discardCards, incrementMoveCounter, movePlayerToLayer } from '../stateOps.js';
import type { BGIOCtx, BGIORandom } from './common.js';
import { type ShootExtraOnMove, getShootProfile } from './shootProfiles.js';

/**
 * 死亡宣言卡 → 附加死亡骰面
 * 对照：docs/manual/04-action-cards.md 死亡宣言
 * 展示式使用（不弃掉），每次 SHOOT 最多 1 张
 */
export function deathFaceFromDecree(cardId: CardID | undefined): number | null {
  if (!cardId) return null;
  if (cardId === 'action_death_decree_3') return 3;
  if (cardId === 'action_death_decree_4') return 4;
  if (cardId === 'action_death_decree_5') return 5;
  return null;
}

/** 校验死亡宣言：在手中 + 是合法 decree；合法时返回骰面 */
export function validateDecree(
  G: SetupState,
  shooterID: string,
  decreeId: CardID | undefined,
): number | null | 'INVALID' {
  if (!decreeId) return null; // 无宣言 OK
  const shooter = G.players[shooterID];
  if (!shooter) return 'INVALID';
  const face = deathFaceFromDecree(decreeId);
  if (face === null) return 'INVALID';
  if (!shooter.hand.includes(decreeId)) return 'INVALID';
  return face;
}

// 改写了 SHOOT 结算的角色技能（ShootSkillSource）：只改掷骰这一步，其余与普通 SHOOT 完全相同。
//   - sudger_verdict：意念判官·定罪，目标改掷 2 颗骰、由射手挑 1 颗
//   - haley_impact：哈雷·冲击，没有实体牌，掷骰结果 -2
//   - fortress_coldness：要塞·冷酷，没有实体牌，骰值不另加修正（梦主射手自带 M4 的 -1）
// 对照：docs/manual/05-dream-thieves.md 意念判官 261 行、哈雷 145 行；docs/manual/06-dream-master.md 要塞 121 行

export interface ShootVariantOpts {
  sameLayerRequired: boolean;
  deathFaces: number[];
  moveFaces: number[];
  extraOnMove: ShootExtraOnMove;
  decreeId?: CardID; // 死亡宣言展示（不弃，附加死亡骰面）
  /** 射手·禁足：SHOOT 结果为 move 时阻止目标移动 */
  preventMove?: boolean;
  /**
   * 跳过 Pisces 闪避响应窗口检查。
   * - 默认 false：首次进入 applyShootVariant 时会检查 target 是否为可闪避双鱼
   * - true：respondShootPass move 重入时设置；防止响应窗口循环开启
   */
  skipPiscesCheck?: boolean;
  /**
   * 跳过 Terrorist 狂热响应窗口检查。
   * - true：respondTerroristDiscard/Accept move 重入时设置
   */
  skipTerroristCheck?: boolean;
  /**
   * 恐怖分子·狂热触发后未弃牌的惩罚：D6 后 baseRoll -1
   * 仅在 respondTerroristAccept 重入时设为 true
   */
  terroristPenalty?: boolean;
  /** 本次 SHOOT 由哪个技能改写了掷骰；缺省为普通出牌 */
  skill?: ShootSkillSource;
}

/**
 * SHOOT 类牌的目标层数限制：要求同层的牌打向别的层时是否违规。
 * 摩羯·节奏：手牌数 >= 所在层数字时，SHOOT 类不受层数限制
 * 恐怖分子·远程：被动免除层数限制
 * 木星·巅峰世界观：SHOOT 类可对相邻层使用
 * 对照：docs/manual/04-action-cards.md SHOOT 使用目标
 */
export function violatesShootLayerLimit(
  G: SetupState,
  shooter: PlayerSetup,
  target: PlayerSetup,
  sameLayerRequired: boolean,
): boolean {
  if (!sameLayerRequired || shooter.currentLayer === target.currentLayer) return false;
  const jupiterRelaxed =
    isJupiterPeakWorldActive(G) && isJupiterPeakLayerOK(shooter.currentLayer, target.currentLayer);
  return (
    !isCapricornusRhythmActive(shooter) && !isTerroristCrossLayerActive(shooter) && !jupiterRelaxed
  );
}

/**
 * 金牛·号角适用的牌：普通 SHOOT 与按 SHOOT 结算的 SHOOT·梦境穿梭剂（选「移动」时不会走到结算）。
 * 对照：docs/manual/05-dream-thieves.md 金牛 75 行「你使用【SHOOT】时」
 */
export function isTaurusHornCard(cardId: CardID): boolean {
  return cardId === 'action_shoot' || cardId === 'action_shoot_dream_transit';
}

/** SHOOT 结算中挂起、等待目标应答的状态（双鱼·闪避 / 恐怖分子·狂热） */
export type PendingShootResponse = NonNullable<SetupState['pendingShootResponse']>;

/** 掷骰与修正链的结果：已写入原始骰值的状态、命中结果、最终结算点数 */
export interface ShootRollOutcome {
  state: SetupState;
  result: ShootOutcome;
  /** 本次 SHOOT 的最终结算点数（处女·完美据此判断） */
  settledRoll: number;
}

/**
 * 前置校验：射手 / 目标 / 手里有牌（哈雷·冲击、要塞·冷酷没有牌） / 层数限制 / 死亡宣言。
 * 通过时返回射手、目标，以及附加死亡宣言后的死亡骰面。
 */
function validateShootRequest(
  G: SetupState,
  shooterID: string,
  targetPlayerID: string,
  cardId: CardID | null,
  opts: ShootVariantOpts,
): { shooter: PlayerSetup; target: PlayerSetup; deathFaces: number[] } | typeof INVALID_MOVE {
  const shooter = G.players[shooterID];
  const target = G.players[targetPlayerID];
  if (!shooter || !target) return INVALID_MOVE;
  if (targetPlayerID === shooterID) return INVALID_MOVE;
  if (!target.isAlive) return INVALID_MOVE;
  // 没有实体牌的 SHOOT 只有哈雷·冲击与要塞·冷酷；其余都要从手里出一张牌
  if ((cardId === null) !== isCardlessShootSkill(opts.skill)) return INVALID_MOVE;
  if (cardId !== null && !shooter.hand.includes(cardId)) return INVALID_MOVE;
  if (violatesShootLayerLimit(G, shooter, target, opts.sameLayerRequired)) return INVALID_MOVE;

  // 死亡宣言校验 + 附加死亡面
  const decreeCheck = validateDecree(G, shooterID, opts.decreeId);
  if (decreeCheck === 'INVALID') return INVALID_MOVE;
  const deathFaces = decreeCheck !== null ? [...opts.deathFaces, decreeCheck] : opts.deathFaces;
  return { shooter, target, deathFaces };
}

/**
 * 掷骰前是否要先挂起一个应答窗口：双鱼·闪避优先，其次恐怖分子·狂热。
 * 已有挂起的窗口、或调用方声明跳过时不再开窗（重入结算时避免循环开窗）。
 * 对照：docs/manual/05-dream-thieves.md 恐怖分子 狂热 247 行
 */
export function pendingResponseKind(
  G: SetupState,
  shooter: PlayerSetup,
  target: PlayerSetup,
  opts: ShootVariantOpts,
): 'pisces' | 'terrorist' | null {
  if (G.pendingShootResponse) return null;
  if (!opts.skipPiscesCheck && canPiscesEvade(target)) return 'pisces';
  // 恐怖分子射手：目标必须弃 1 张牌，否则骰 -1
  if (!opts.skipTerroristCheck && shooter.characterId === 'thief_terrorist' && target.isAlive) {
    return 'terrorist';
  }
  return null;
}

/** 组装待应答状态：只记原始的骰面（不含死亡宣言附加面），重入结算时再校验宣言 */
export function buildPendingShootResponse(
  shooterID: string,
  targetPlayerID: string,
  cardId: CardID | null,
  opts: ShootVariantOpts,
  responseType: 'pisces' | 'terrorist',
): PendingShootResponse {
  return {
    shooterID,
    targetPlayerID,
    cardId,
    sameLayerRequired: opts.sameLayerRequired,
    deathFaces: opts.deathFaces,
    moveFaces: opts.moveFaces,
    extraOnMove: opts.extraOnMove,
    decreeId: opts.decreeId,
    preventMove: opts.preventMove,
    responseType,
    skill: opts.skill,
  };
}

/** 从待应答状态还原 SHOOT 结算选项（应答后重入结算用） */
export function shootOptsFromPending(pending: PendingShootResponse): ShootVariantOpts {
  return {
    sameLayerRequired: pending.sameLayerRequired,
    deathFaces: pending.deathFaces,
    moveFaces: pending.moveFaces,
    extraOnMove: pending.extraOnMove,
    decreeId: pending.decreeId,
    preventMove: pending.preventMove,
    skill: pending.skill,
  };
}

/**
 * 掷骰与修正链：恐怖分子惩罚、M4、灵雕师、天蝎、金牛、木星·雷霆。
 * 随机数的抽取次数与先后顺序决定后续所有骰值：第一颗 D6 恒先抽，天蝎恒再抽一颗，
 * 金牛仅在第一次结果不是击杀时再抽一颗。
 */
export function rollShootOutcome(
  G: SetupState,
  shooterID: string,
  targetPlayerID: string,
  cardId: CardID | null,
  faces: { deathFaces: number[]; moveFaces: number[] },
  random: BGIORandom,
  terroristPenalty?: boolean,
  haleyImpact?: boolean,
): ShootRollOutcome {
  const shooter = G.players[shooterID]!;
  const target = G.players[targetPlayerID]!;
  const { deathFaces, moveFaces } = faces;

  const rawD6 = random.D6();
  // 恐怖分子·狂热惩罚：未弃牌时 baseRoll -1，点数修正最低为 1（与 M4、要塞、哈雷等修正一致）
  // 哈雷·冲击：掷骰结果 -2，最低为 1（对照：docs/manual/05-dream-thieves.md 哈雷 145 行）
  const baseRoll = haleyImpact
    ? applyHaleyImpact(rawD6)
    : terroristPenalty
      ? Math.max(1, rawD6 - 1)
      : rawD6;
  // M4 卡宾枪全局化 —— 梦主使用 SHOOT 时目标骰 -1（基线梦主优势）
  // 对照：docs/manual/03-game-flow.md §80-81 M4 卡宾枪道具；§111 印证 M4 先于效果处理
  // 仅在"未被角色技能重写骰值"的通用路径生效，不影响灵雕师 override / 天蝎毒针等特殊处理
  //   （这些路径的 shooter 都是盗梦者，M4 本来就不触发）
  // M4 卡宾枪属于梦主本人，背叛者（梦主阵营的原盗梦者）没有
  const shooterIsMaster = shooterID === G.dreamMasterID;
  const postM4Roll = applyM4CarbineModifier(shooterIsMaster, baseRoll);

  // 要塞世界观：目标是梦主本人时，目标这一次的掷骰结果 -1（最低为 1）。
  // 先后关系：恐怖分子惩罚 / 哈雷（已并入 baseRoll）→ 要塞 → 处女·完美按最终点数判断；
  // 灵雕师·雕琢直接用手牌数作最终点数，不被要塞改变；天蝎毒针对两颗骰取差值后的结果再 -1；
  // 金牛号角拿修正后的点数与自己的骰比大小。M4 属于梦主射手，目标是梦主时不会同时生效。
  // 对照：docs/manual/06-dream-master.md 要塞 123 行；docs/manual/05-dream-thieves.md 灵雕师 300 行
  const forMasterTarget = (roll: number): number => applyFortressWorldRoll(G, targetPlayerID, roll);

  // 记录原始骰值供客户端骰子动画使用（展示未修饰的真实 D6 结果）
  let state: SetupState = { ...G, lastShootRoll: rawD6 };
  let result: ShootOutcome;
  let settledRoll: number;

  if (shooter.characterId === 'thief_soul_sculptor') {
    // 灵雕师·雕琢：override 模式，直接用 target 手牌数当骰值（最高优先级，不可改）
    settledRoll = applySoulSculptorCarve(target.hand.length);
    result = resolveShootCustom(settledRoll, deathFaces, moveFaces);
  } else if (
    shooter.characterId === 'thief_scorpius' &&
    canUseSkill(shooter, SCORPIUS_SKILL_ID, 'ownTurnOncePerTurn')
  ) {
    // 天蝎·毒针：再掷一颗取差值
    settledRoll = forMasterTarget(applyScorpiusPoison(baseRoll, random.D6()));
    result = resolveShootCustom(settledRoll, deathFaces, moveFaces);
    state = markSkillUsed(state, shooterID, SCORPIUS_SKILL_ID);
  } else if (
    shooter.characterId === 'thief_taurus' &&
    cardId !== null &&
    isTaurusHornCard(cardId)
  ) {
    // 金牛：先按 target 骰算 base result；若非 kill 再掷 self 骰看是否 override 为 kill
    // 号角只对【SHOOT】生效，刺客之王 / 爆甲螺旋 / 炸裂弹头不触发（docs/manual/05-dream-thieves.md 金牛 75 行）
    const targetRoll = forMasterTarget(baseRoll);
    settledRoll = targetRoll;
    const baseResult = resolveShootCustom(targetRoll, deathFaces, moveFaces);
    result = baseResult;
    if (baseResult !== 'kill' && applyTaurusHorn(targetRoll, random.D6()) === 'kill') {
      result = 'kill';
    }
  } else {
    // 通用路径：使用 M4 修饰后骰值（梦主 SHOOT 时 -1，盗梦者 SHOOT 时恒等），目标是梦主时再按要塞 -1
    settledRoll = forMasterTarget(postM4Roll);
    result = resolveShootCustom(settledRoll, deathFaces, moveFaces);
  }

  // 木星·雷霆：梦主使用 SHOOT 类，目标骰 < 梦主层 → 直接击杀
  // docs/manual/06-dream-master.md 木星·巅峰 雷霆 + manual §50 "叠加 M4 -1"
  if (
    result !== 'kill' &&
    shouldJupiterThunderKill(shooter.characterId, shooter.currentLayer, postM4Roll)
  ) {
    result = 'kill';
  }
  return { state, result, settledRoll };
}

/** 命中击杀：击杀目标，并按需挂起白羊·星尘的选择 */
function applyShootKill(s: SetupState, shooterID: string, targetPlayerID: string): SetupState {
  // 白羊·星尘 onKilled 响应（简化 pending，可替换为完整响应栈）
  // 对照：docs/manual/05-dream-thieves.md 白羊 62-71 行
  // 注：击杀结算会把被害者挪进迷失层，所以先记下原所在层
  const victimLayer = s.players[targetPlayerID]!.currentLayer;
  let next = killPlayer(s, targetPlayerID, shooterID);
  if (canAriesStardustTrigger(next, targetPlayerID, victimLayer)) {
    const ariesID = findAliveAriesID(next)!;
    next = {
      ...next,
      pendingAriesChoice: {
        ariesID,
        victimLayer,
        victimID: targetPlayerID,
      },
    };
  }
  return next;
}

/**
 * 命中移动：先做附带弃牌，再移层。
 * 返回 awaitingLayerChoice=true 表示已挂起由发动方选层，之后的结算推迟到 resolveShootMove。
 */
function applyShootMove(
  s: SetupState,
  shooterID: string,
  targetPlayerID: string,
  cardId: CardID | null,
  opts: SettleOpts,
): { state: SetupState; awaitingLayerChoice: boolean } {
  let next = s;
  // on-move 副作用：弃目标特定手牌
  if (opts.extraOnMove) {
    const tp = next.players[targetPlayerID]!;
    const dropped = tp.hand.filter((id) =>
      opts.extraOnMove === 'discard_unlocks' ? id === 'action_unlock' : isShootClassCard(id),
    );
    if (dropped.length > 0) {
      next = discardCards(next, targetPlayerID, dropped);
    }
  }
  // 相邻层选择（1<->2, 2<->3, 3<->4；L1/L4 唯一相邻层自动移动；L2/L3 两选一 → 挂起）
  // 规则：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
  // 射手·禁足：opts.preventMove 令目标不移动
  if (opts.preventMove) return { state: next, awaitingLayerChoice: false };
  const choices = computeShootMoveChoices(next.players[targetPlayerID]!.currentLayer);
  if (choices.length === 1) {
    // L1→[2] / L4→[3]：唯一相邻层，自动移动 + 继续结算
    return {
      state: movePlayerToLayer(next, targetPlayerID, choices[0]!),
      awaitingLayerChoice: false,
    };
  }
  if (choices.length >= 2) {
    // L2/L3：挂起由发动方选择
    return {
      state: {
        ...next,
        pendingShootMove: {
          shooterID,
          targetPlayerID,
          cardId,
          extraOnMove: opts.extraOnMove,
          choices,
        },
      },
      awaitingLayerChoice: true,
    };
  }
  // choices.length === 0（理论不会发生，因为 layer 必在 1..4）：兜底不移动
  return { state: next, awaitingLayerChoice: false };
}

/** 结果落地需要的选项：命中「移动」时的附带弃牌与射手·禁足 */
type SettleOpts = Pick<ShootVariantOpts, 'extraOnMove' | 'preventMove'>;

/**
 * 结果落地：弃牌、水星·逆流，再按击杀 / 移动 / 未命中处理，最后检查处女·完美。
 * 普通 SHOOT、意念判官选骰后、哈雷·冲击、要塞·冷酷都从这里落地；cardId 为 null（哈雷、要塞）时没有牌可弃，
 * 也不触发水星·逆流。
 */
export function settleShootResult(
  rolled: ShootRollOutcome,
  shooterID: string,
  targetPlayerID: string,
  cardId: CardID | null,
  opts: SettleOpts,
): SetupState {
  let s = rolled.state;
  if (cardId !== null) {
    s = discardCard(s, shooterID, cardId);
    // 水星·逆流：贿赂者对梦主出牌 → 梦主先收入
    s = applyMercuryReverse(s, shooterID, cardId, targetPlayerID) ?? s;
  }

  if (rolled.result === 'kill') {
    s = applyShootKill(s, shooterID, targetPlayerID);
  } else if (rolled.result === 'move') {
    const moved = applyShootMove(s, shooterID, targetPlayerID, cardId, opts);
    // 挂起选层的分支提前结束：命中「移动」的点数不会是 6，不会触发处女·完美
    if (moved.awaitingLayerChoice) return incrementMoveCounter(moved.state);
    s = moved.state;
  }

  // SHOOT 结算完成后检查处女·完美（按最终点数判断是否为 6）
  //   此处覆盖 kill / miss / L1L4 自动移动 / preventMove 情形
  s = settleVirgoPerfect(s, rolled.settledRoll);
  return incrementMoveCounter(s);
}

/**
 * SHOOT 变体共享结算：校验 → 应答窗口 → 掷骰修正 → 结果落地
 * 对照：docs/manual/04-action-cards.md SHOOT 变体 + 死亡宣言
 */
export function applyShootVariant(
  G: SetupState,
  ctx: BGIOCtx,
  random: BGIORandom,
  targetPlayerID: string,
  cardId: CardID | null,
  rawOpts: ShootVariantOpts,
): SetupState | typeof INVALID_MOVE {
  // 客户端用 null 表示「没传」：统一成 undefined，免得 null 被写进待结算状态
  const opts: ShootVariantOpts = {
    ...rawOpts,
    decreeId: rawOpts.decreeId ?? undefined,
    preventMove: rawOpts.preventMove ?? undefined,
  };
  const shooterID = ctx.currentPlayer;
  const checked = validateShootRequest(G, shooterID, targetPlayerID, cardId, opts);
  if (checked === INVALID_MOVE) return INVALID_MOVE;

  const responseType = pendingResponseKind(G, checked.shooter, checked.target, opts);
  if (responseType) {
    return {
      ...G,
      pendingShootResponse: buildPendingShootResponse(
        shooterID,
        targetPlayerID,
        cardId,
        opts,
        responseType,
      ),
    };
  }

  // 意念判官·定罪：目标改掷 2 颗骰，挂起等射手挑 1 颗；之后由 resolveSudgerPick 落地
  if (opts.skill === 'sudger_verdict' && cardId !== null) {
    const rollA = random.D6();
    const rollB = random.D6();
    return {
      ...G,
      pendingSudgerRolls: {
        rollA,
        rollB,
        targetPlayerID,
        cardId,
        deathFaces: checked.deathFaces,
        moveFaces: opts.moveFaces,
        extraOnMove: opts.extraOnMove,
      },
    };
  }

  const rolled = rollShootOutcome(
    G,
    shooterID,
    targetPlayerID,
    cardId,
    { deathFaces: checked.deathFaces, moveFaces: opts.moveFaces },
    random,
    opts.terroristPenalty,
    opts.skill === 'haley_impact',
  );
  return settleShootResult(rolled, shooterID, targetPlayerID, cardId, opts);
}

/**
 * 意念判官选骰后的结算：按选中的那颗得出结果，再走与普通 SHOOT 同一个结果落地。
 * 选中的那颗写入 lastShootRoll；骰面取自挂起时记下的参数表与死亡宣言。
 * 对照：docs/manual/05-dream-thieves.md 意念判官 261 行
 */
export function settleSudgerPick(
  G: SetupState,
  shooterID: string,
  pick: 'A' | 'B',
): SetupState | typeof INVALID_MOVE {
  const pending = G.pendingSudgerRolls;
  if (!pending) return INVALID_MOVE;
  const chosenRoll = applySudgerVerdict(pending.rollA, pending.rollB, pick);
  // 目标是梦主时，要塞世界观对选中的那颗再 -1（两颗骰同减，不改变挑哪颗更有利）
  const settledRoll = applyFortressWorldRoll(G, pending.targetPlayerID, chosenRoll);
  const rolled: ShootRollOutcome = {
    state: { ...G, pendingSudgerRolls: null, lastShootRoll: chosenRoll },
    result: resolveShootCustom(settledRoll, pending.deathFaces, pending.moveFaces),
    settledRoll,
  };
  return settleShootResult(rolled, shooterID, pending.targetPlayerID, pending.cardId, {
    extraOnMove: pending.extraOnMove,
  });
}

/**
 * 按牌 id 取参数表后结算：出牌 move 与技能复用 SHOOT 结算时用。
 * 牌不在参数表里（不是 SHOOT 类）一律视为非法。
 */
export function applyShootByCard(
  G: SetupState,
  ctx: BGIOCtx,
  random: BGIORandom,
  targetPlayerID: string,
  cardId: CardID,
  extra: Pick<ShootVariantOpts, 'decreeId' | 'preventMove' | 'skill'> = {},
): SetupState | typeof INVALID_MOVE {
  const profile = getShootProfile(cardId);
  if (!profile) return INVALID_MOVE;
  return applyShootVariant(G, ctx, random, targetPlayerID, cardId, { ...profile, ...extra });
}

/**
 * 应答结束后重入 SHOOT 结算：传入的状态应已清掉 pendingShootResponse，
 * 射手回到发起者身份，参数按待应答状态还原。
 */
export function resumeShootAfterResponse(
  G: SetupState,
  ctx: BGIOCtx,
  random: BGIORandom,
  pending: PendingShootResponse,
  skips: Pick<ShootVariantOpts, 'skipPiscesCheck' | 'skipTerroristCheck' | 'terroristPenalty'>,
): SetupState | typeof INVALID_MOVE {
  const shooterCtx: BGIOCtx = { ...ctx, currentPlayer: pending.shooterID };
  return applyShootVariant(G, shooterCtx, random, pending.targetPlayerID, pending.cardId, {
    ...shootOptsFromPending(pending),
    ...skips,
  });
}

/**
 * 计算 SHOOT 命中 move 时，目标可去的相邻层列表（排除迷失层 0）。
 *   L1 → [2] | L4 → [3] | L2 → [1,3] | L3 → [2,4]
 *   对照：docs/manual/04-action-cards.md "移动到相邻的另一层梦境的效果不会让玩家进入迷失层"
 */
export function computeShootMoveChoices(currentLayer: number): number[] {
  const adj: number[] = [];
  if (currentLayer - 1 >= 1) adj.push(currentLayer - 1);
  if (currentLayer + 1 <= 4) adj.push(currentLayer + 1);
  return adj;
}
