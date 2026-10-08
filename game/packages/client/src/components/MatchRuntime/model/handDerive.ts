// 手牌区的纯推导（移动、桌面共用）：读牌信息、此刻能不能打、主操作按钮
// 卡牌效果说明文字：共享卡牌数据里行动牌的 effects 目前是空的，没有可显示的效果文案，
// 所以信息条只显示「卡名 · 类别 · 目标要求 · 此刻能不能打及原因」，不自行编写规则文字。

import { actionMoveFor, type PlayRole } from '../../../lib/cards';
import type { HandCardItem } from '../controllerTypes';

// ---------------------------------------------------------------------------
// 卡牌类别与目标要求
// ---------------------------------------------------------------------------

export type CardCategory = 'attack' | 'unlock' | 'support';

/** 卡牌类别（卡边色条与信息条文字）：射击 / 踢 / 死亡宣言算攻击，两种解封算解封，其余为辅助 */
export function cardCategoryOf(cardId: string): CardCategory {
  if (
    cardId.startsWith('action_shoot') ||
    cardId === 'action_kick' ||
    cardId.startsWith('action_death_decree')
  ) {
    return 'attack';
  }
  if (cardId === 'action_unlock' || cardId === 'action_nightmare_unlock') return 'unlock';
  return 'support';
}

/** 打出时需要的目标：无 / 目标玩家 / 目标层 / 先选结算方式或多个目标 / 死亡宣言（随 SHOOT 一起打出） */
export type CardTargetKind = 'none' | 'player' | 'layer' | 'choice' | 'decree';

export function cardTargetKind(cardId: string, role: PlayRole = 'thief'): CardTargetKind | null {
  if (cardId === 'action_shoot_dream_transit' || cardId === 'action_gravity') return 'choice';
  if (cardId.startsWith('action_death_decree')) return 'decree';
  const spec = actionMoveFor(cardId, role);
  return spec ? spec.needsTarget : null;
}

// ---------------------------------------------------------------------------
// 这张牌此刻会不会被引擎拒绝
// ---------------------------------------------------------------------------

/**
 * 界面上看着能打、但引擎必拒的几种情形：
 *   dead            已在迷失层：不能使用行动牌（docs/manual/03-game-flow.md:55、:62）
 *   masterNoUnlock  梦主不能使用【解封】效果①，只能在响应窗口里用效果②抵消（docs/manual/04-action-cards.md:97）
 *   revivedNoUnlock 本回合复活过自己：不能用【解封】效果①（docs/manual/04-action-cards.md:94）
 *   noPeekTarget    梦主的【梦境窥视】效果②必须有一名持有贿赂牌的盗梦者可看（docs/manual/04-action-cards.md:115、:119）
 *   noHeartLock     所在层的心锁已经是 0，没有可解的锁（docs/manual/04-action-cards.md:93）
 *   unlockLimit     本回合成功解锁的次数已用尽（docs/manual/03-game-flow.md:26-28；摩羯·节奏、水瓶·同流豁免）
 *   noNightmareTarget 【梦魇解封】要有一层还盖着暗置的梦魇（docs/manual/04-action-cards.md 梦魇解封）
 */
export type PlayBlockReason =
  | 'dead'
  | 'masterNoUnlock'
  | 'revivedNoUnlock'
  | 'noPeekTarget'
  | 'noHeartLock'
  | 'unlockLimit'
  | 'noNightmareTarget';

/** 判断一张牌能否打出所需的、从视图推导出来的信息 */
export interface PlayRuleContext {
  readonly role: PlayRole;
  readonly alive: boolean;
  /** 本回合复活过自己（本人 skillUsedThisTurn 里的标记） */
  readonly revivedSelfThisTurn: boolean;
  /** 梦境窥视效果②有没有可选目标（存活、非梦主、持有贿赂牌的盗梦者） */
  readonly hasPeekMasterTarget: boolean;
  /** 本人所在层的心锁数（公开）；不知道为 null */
  readonly layerHeartLock: number | null;
  /** 本回合的解封次数已用尽（含摩羯 / 水瓶的豁免，见 lib/unlockLimit.ts） */
  readonly unlockExhausted: boolean;
  /** 有没有一层还盖着暗置的梦魇（未翻开且没被发动 / 弃掉，这两个标记都是公开的） */
  readonly hasNightmareUnlockTarget: boolean;
}

/** 没有额外信息时的缺省：存活的盗梦者、没复活过、没有窥视目标（盗梦者不走效果②，用不到） */
export const DEFAULT_PLAY_RULES: PlayRuleContext = {
  role: 'thief',
  alive: true,
  revivedSelfThisTurn: false,
  hasPeekMasterTarget: false,
  layerHeartLock: null,
  unlockExhausted: false,
  hasNightmareUnlockTarget: true,
};

/** 这张牌此刻被引擎拒绝的原因；没有原因返回 null（只判断本表里的几种，其余由引擎校验） */
export function playBlockReason(card: string, rules: PlayRuleContext): PlayBlockReason | null {
  if (!rules.alive) return 'dead';
  if (card === 'action_unlock') {
    if (rules.role === 'master') return 'masterNoUnlock';
    if (rules.revivedSelfThisTurn) return 'revivedNoUnlock';
    if (rules.layerHeartLock !== null && rules.layerHeartLock <= 0) return 'noHeartLock';
    if (rules.unlockExhausted) return 'unlockLimit';
  }
  if (card === 'action_nightmare_unlock' && !rules.hasNightmareUnlockTarget) {
    return 'noNightmareTarget';
  }
  if (card === 'action_dream_peek' && rules.role === 'master' && !rules.hasPeekMasterTarget) {
    return 'noPeekTarget';
  }
  return null;
}

// ---------------------------------------------------------------------------
// 此刻能不能打
// ---------------------------------------------------------------------------

export type VerdictReason =
  | 'ok'
  | 'notMyTurn'
  | 'notActionPhase'
  | 'gameOver'
  | 'discardPhase'
  | 'noUi'
  | PlayBlockReason;

export interface CardVerdict {
  readonly canPlay: boolean;
  readonly reason: VerdictReason;
}

export interface VerdictContext {
  readonly isMyTurn: boolean;
  readonly turnPhase: string;
  readonly winner: string | null;
}

/** 一张手牌此刻能不能打；不能打时给出原因（用 controller 已算好的用途 mode 为准） */
export function cardVerdict(
  item: Pick<HandCardItem, 'mode'> & { readonly blockReason?: PlayBlockReason | null },
  ctx: VerdictContext,
): CardVerdict {
  if (item.mode === 'play') return { canPlay: true, reason: 'ok' };
  if (item.mode === 'discard') return { canPlay: false, reason: 'discardPhase' };
  if (ctx.winner) return { canPlay: false, reason: 'gameOver' };
  if (!ctx.isMyTurn) return { canPlay: false, reason: 'notMyTurn' };
  if (ctx.turnPhase !== 'action') return { canPlay: false, reason: 'notActionPhase' };
  if (item.blockReason) return { canPlay: false, reason: item.blockReason };
  return { canPlay: false, reason: 'noUi' };
}

/** 行动阶段轮到本人、但这张牌打不出：卡面要变暗并带禁用图标 */
export function isBlockedInAction(item: Pick<HandCardItem, 'mode'>, ctx: VerdictContext): boolean {
  return ctx.isMyTurn && ctx.turnPhase === 'action' && !ctx.winner && item.mode === 'idle';
}

// ---------------------------------------------------------------------------
// 主操作按钮
// ---------------------------------------------------------------------------

export type MainActionKind = 'draw' | 'end' | 'skipDiscard' | 'confirmDiscard' | 'wait';

export interface MainAction {
  readonly kind: MainActionKind;
  readonly enabled: boolean;
  /** 端到端用例依赖的 data-testid */
  readonly testId: string;
  /** i18n 键 */
  readonly labelKey: string;
}

export interface MainActionInput {
  readonly isMine: boolean;
  readonly winner: string | null;
  readonly phase: string;
  /** 手牌超出上限的张数 */
  readonly overflow: number;
  readonly canConfirmDiscard: boolean;
}

/** 随回合阶段变化的主操作：抽牌 / 结束行动 / 跳过弃牌 / 确认弃牌；不是本人回合时禁用并显示「等待」 */
export function deriveMainAction(input: MainActionInput): MainAction {
  const { isMine, winner, phase, overflow, canConfirmDiscard } = input;
  const wait: MainAction = {
    kind: 'wait',
    enabled: false,
    testId: 'action-wait',
    labelKey: 'handInfo.wait',
  };
  if (!isMine || winner) return wait;
  switch (phase) {
    case 'draw':
      return { kind: 'draw', enabled: true, testId: 'action-draw', labelKey: 'localMatch.draw' };
    case 'action':
      return {
        kind: 'end',
        enabled: true,
        testId: 'action-end',
        labelKey: 'localMatch.endAction',
      };
    case 'discard':
      return overflow > 0
        ? {
            kind: 'confirmDiscard',
            enabled: canConfirmDiscard,
            testId: 'action-confirm-discard',
            labelKey: 'localMatch.confirmDiscard',
          }
        : {
            kind: 'skipDiscard',
            enabled: true,
            testId: 'action-skip-discard',
            labelKey: 'localMatch.skipDiscard',
          };
    default:
      return wait;
  }
}
