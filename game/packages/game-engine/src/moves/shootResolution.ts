// SHOOT 的共同结算：层数限制、死亡宣言、双鱼与恐怖分子的应答挂起、骰值修正链、命中后的处理。

import type { CardID } from '@icgame/shared';
import { resolveShootCustom } from '../dice.js';
import { killPlayer } from '../engine/death.js';
import { INVALID_MOVE } from '../engine/invalidMove.js';
import {
  SCORPIUS_SKILL_ID,
  applyM4CarbineModifier,
  applyMercuryReverse,
  applyScorpiusPoison,
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
import type { PlayerSetup, SetupState } from '../setup.js';
import { discardCard, discardCards, incrementMoveCounter, movePlayerToLayer } from '../stateOps.js';
import type { BGIOCtx, BGIORandom } from './common.js';

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

export interface ShootVariantOpts {
  sameLayerRequired: boolean;
  deathFaces: number[];
  moveFaces: number[];
  extraOnMove: 'discard_unlocks' | 'discard_shoots' | null;
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

/**
 * SHOOT 变体共享结算：kill/move/miss + 可选 on-move 弃牌副作用 + 死亡宣言
 * 对照：docs/manual/04-action-cards.md SHOOT 变体 + 死亡宣言
 */
export function applyShootVariant(
  G: SetupState,
  ctx: BGIOCtx,
  random: BGIORandom,
  targetPlayerID: string,
  cardId: CardID,
  rawOpts: ShootVariantOpts,
): SetupState | typeof INVALID_MOVE {
  // 客户端用 null 表示「没传」：统一成 undefined，免得 null 被写进待结算状态
  const opts: ShootVariantOpts = {
    ...rawOpts,
    decreeId: rawOpts.decreeId ?? undefined,
    preventMove: rawOpts.preventMove ?? undefined,
  };
  const shooter = G.players[ctx.currentPlayer];
  const target = G.players[targetPlayerID];
  if (!shooter || !target) return INVALID_MOVE;
  if (targetPlayerID === ctx.currentPlayer) return INVALID_MOVE;
  if (!target.isAlive) return INVALID_MOVE;
  if (!shooter.hand.includes(cardId)) return INVALID_MOVE;
  if (violatesShootLayerLimit(G, shooter, target, opts.sameLayerRequired)) return INVALID_MOVE;

  // 死亡宣言校验 + 附加死亡面
  const decreeCheck = validateDecree(G, ctx.currentPlayer, opts.decreeId);
  if (decreeCheck === 'INVALID') return INVALID_MOVE;
  const deathFaces = decreeCheck !== null ? [...opts.deathFaces, decreeCheck] : opts.deathFaces;

  // Pisces 闪避响应窗口（pre-roll）
  // skipPiscesCheck=true 由 respondShootPass move 重入时设置
  if (!opts.skipPiscesCheck && !G.pendingShootResponse && canPiscesEvade(target)) {
    return {
      ...G,
      pendingShootResponse: {
        shooterID: ctx.currentPlayer,
        targetPlayerID,
        cardId,
        sameLayerRequired: opts.sameLayerRequired,
        deathFaces: opts.deathFaces,
        moveFaces: opts.moveFaces,
        extraOnMove: opts.extraOnMove,
        decreeId: opts.decreeId,
        preventMove: opts.preventMove,
        responseType: 'pisces',
      },
    };
  }

  // Terrorist 狂热响应窗口（pre-roll，Pisces 之后）
  // 触发：shooter 是恐怖分子（被动技能 skill_1）→ target 必须弃 1 张否则骰 -1
  // 对照：docs/manual/05-dream-thieves.md 恐怖分子 狂热 247 行
  if (
    !opts.skipTerroristCheck &&
    !G.pendingShootResponse &&
    shooter.characterId === 'thief_terrorist' &&
    target.isAlive
  ) {
    return {
      ...G,
      pendingShootResponse: {
        shooterID: ctx.currentPlayer,
        targetPlayerID,
        cardId,
        sameLayerRequired: opts.sameLayerRequired,
        deathFaces: opts.deathFaces,
        moveFaces: opts.moveFaces,
        extraOnMove: opts.extraOnMove,
        decreeId: opts.decreeId,
        preventMove: opts.preventMove,
        responseType: 'terrorist',
      },
    };
  }

  const rawD6 = random.D6();
  // 恐怖分子·狂热惩罚：未弃牌时 baseRoll -1，点数修正最低为 1（与 M4、要塞、哈雷等修正一致）
  const baseRoll = opts.terroristPenalty ? Math.max(1, rawD6 - 1) : rawD6;
  // M4 卡宾枪全局化 —— 梦主使用 SHOOT 时目标骰 -1（基线梦主优势）
  // 对照：docs/manual/03-game-flow.md §80-81 M4 卡宾枪道具；§111 印证 M4 先于效果处理
  // 仅在"未被角色技能重写骰值"的通用路径生效，不影响灵雕师 override / 天蝎毒针等特殊处理
  //   （这些路径的 shooter 都是盗梦者，M4 本来就不触发）
  // M4 卡宾枪属于梦主本人，背叛者（梦主阵营的原盗梦者）没有
  const shooterIsMaster = ctx.currentPlayer === G.dreamMasterID;
  const postM4Roll = applyM4CarbineModifier(shooterIsMaster, baseRoll);

  // 记录原始骰值供客户端骰子动画使用（展示未修饰的真实 D6 结果）
  // lastShootRoll 记录原始 D6（1-6）供动画展示；resolution 用修饰后 baseRoll
  const s0 = { ...G, lastShootRoll: rawD6 };

  // === 角色 SHOOT 修饰链 ===
  // 天蝎·毒针 / 金牛·号角
  // 灵雕师·雕琢（最高优先级，override 不可改）
  // hook 注入: opts.diceModifierHint 用于哈雷·冲击的免费 SHOOT
  let result: 'kill' | 'move' | 'miss';
  let preState: SetupState = s0;
  // 本次 SHOOT 的最终结算点数（处女·完美据此判断）
  let settledRoll: number;

  // 灵雕师·雕琢：override 模式，直接用 target 手牌数当骰值
  if (shooter.characterId === 'thief_soul_sculptor') {
    const finalRoll = applySoulSculptorCarve(target.hand.length);
    settledRoll = finalRoll;
    result = resolveShootCustom(finalRoll, deathFaces, opts.moveFaces);
  } else if (
    shooter.characterId === 'thief_scorpius' &&
    canUseSkill(shooter, SCORPIUS_SKILL_ID, 'ownTurnOncePerTurn')
  ) {
    const roll2 = random.D6();
    const finalRoll = applyScorpiusPoison(baseRoll, roll2);
    settledRoll = finalRoll;
    result = resolveShootCustom(finalRoll, deathFaces, opts.moveFaces);
    preState = markSkillUsed(preState, ctx.currentPlayer, SCORPIUS_SKILL_ID);
  } else if (shooter.characterId === 'thief_taurus' && isTaurusHornCard(cardId)) {
    // 金牛：先按 target 骰算 base result；若非 kill 再掷 self 骰看是否 override 为 kill
    // 号角只对【SHOOT】生效，刺客之王 / 爆甲螺旋 / 炸裂弹头不触发（docs/manual/05-dream-thieves.md 金牛 75 行）
    settledRoll = baseRoll;
    const baseResult = resolveShootCustom(baseRoll, deathFaces, opts.moveFaces);
    if (baseResult !== 'kill') {
      const selfRoll = random.D6();
      result = applyTaurusHorn(baseRoll, selfRoll) === 'kill' ? 'kill' : baseResult;
    } else {
      result = baseResult;
    }
  } else {
    // 通用路径：使用 M4 修饰后骰值（梦主 SHOOT 时 -1，盗梦者 SHOOT 时恒等）
    settledRoll = postM4Roll;
    result = resolveShootCustom(postM4Roll, deathFaces, opts.moveFaces);
  }

  // 木星·雷霆：梦主使用 SHOOT 类，目标骰 < 梦主层 → 直接击杀
  // cards-data.json dm_jupiter_peak 雷霆 + manual §50 "叠加 M4 -1"
  if (result !== 'kill') {
    if (shouldJupiterThunderKill(shooter.characterId, shooter.currentLayer, postM4Roll)) {
      result = 'kill';
    }
  }

  let s = discardCard(preState, ctx.currentPlayer, cardId);
  // 水星·逆流：贿赂者对梦主出牌 → 梦主先收入
  s = applyMercuryReverse(s, ctx.currentPlayer, cardId, targetPlayerID) ?? s;

  if (result === 'kill') {
    // 白羊·星尘 onKilled 响应（简化 pending，可替换为完整响应栈）
    // 对照：docs/manual/05-dream-thieves.md 白羊 62-71 行
    // 注：击杀结算会把被害者挪进迷失层，所以先记下原所在层
    const victimLayer = s.players[targetPlayerID]!.currentLayer;
    s = killPlayer(s, targetPlayerID, ctx.currentPlayer);
    if (canAriesStardustTrigger(s, targetPlayerID, victimLayer)) {
      const ariesID = findAliveAriesID(s)!;
      s = {
        ...s,
        pendingAriesChoice: {
          ariesID,
          victimLayer,
          victimID: targetPlayerID,
        },
      };
    }
  } else if (result === 'move') {
    // on-move 副作用：弃目标特定手牌
    if (opts.extraOnMove) {
      const tp = s.players[targetPlayerID]!;
      const dropped = tp.hand.filter((id) =>
        opts.extraOnMove === 'discard_unlocks' ? id === 'action_unlock' : isShootClassCard(id),
      );
      if (dropped.length > 0) {
        s = discardCards(s, targetPlayerID, dropped);
      }
    }
    // 相邻层选择（1<->2, 2<->3, 3<->4；L1/L4 唯一相邻层自动移动；L2/L3 两选一 → 挂起）
    // 规则：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
    // 射手·禁足：opts.preventMove 令目标不移动
    if (!opts.preventMove) {
      const cur = s.players[targetPlayerID]!.currentLayer;
      const choices = computeShootMoveChoices(cur);
      if (choices.length === 1) {
        // L1→[2] / L4→[3]：唯一相邻层，自动移动 + 继续结算
        s = movePlayerToLayer(s, targetPlayerID, choices[0]!);
      } else if (choices.length >= 2) {
        // L2/L3：挂起由发动方（ctx.currentPlayer）选择；之后的结算推迟到 resolveShootMove
        s = {
          ...s,
          pendingShootMove: {
            shooterID: ctx.currentPlayer,
            targetPlayerID,
            cardId,
            extraOnMove: opts.extraOnMove,
            choices,
          },
        };
        return incrementMoveCounter(s);
      }
      // choices.length === 0（理论不会发生，因为 layer 必在 1..4）：兜底不移动
    }
  }

  // SHOOT 结算完成后检查处女·完美（按最终点数判断是否为 6）
  //   注意：choices.length>=2 的挂起分支已在上方 return（命中「移动」的点数不会是 6，不会触发完美），
  //   此处仅覆盖 kill / miss / L1L4 自动移动 / preventMove 情形
  s = settleVirgoPerfect(s, settledRoll);
  return incrementMoveCounter(s);
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
