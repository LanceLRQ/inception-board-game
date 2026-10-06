// 移动布局手牌坞的纯推导：读牌信息、此刻能不能打、主操作按钮、上下滑手势的判定
// 卡牌效果说明文字：共享卡牌数据里行动牌的 effects 目前是空的，没有可显示的效果文案，
// 所以信息条只显示「卡名 · 类别 · 目标要求 · 此刻能不能打及原因」，不自行编写规则文字。

import { actionMoveFor } from '../../../lib/cards';
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

export function cardTargetKind(cardId: string): CardTargetKind | null {
  if (cardId === 'action_shoot_dream_transit' || cardId === 'action_gravity') return 'choice';
  if (cardId.startsWith('action_death_decree')) return 'decree';
  const spec = actionMoveFor(cardId);
  return spec ? spec.needsTarget : null;
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
  | 'noUi';

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
export function cardVerdict(item: Pick<HandCardItem, 'mode'>, ctx: VerdictContext): CardVerdict {
  if (item.mode === 'play') return { canPlay: true, reason: 'ok' };
  if (item.mode === 'discard') return { canPlay: false, reason: 'discardPhase' };
  if (ctx.winner) return { canPlay: false, reason: 'gameOver' };
  if (!ctx.isMyTurn) return { canPlay: false, reason: 'notMyTurn' };
  if (ctx.turnPhase !== 'action') return { canPlay: false, reason: 'notActionPhase' };
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
  /** 与经典布局相同语义的 data-testid */
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
    labelKey: 'mobile.dock.wait',
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

// ---------------------------------------------------------------------------
// 手牌坞上下滑
// ---------------------------------------------------------------------------

/** 拖动超过这个距离（像素）即视为展开 / 收起 */
export const SHEET_DRAG_DISTANCE = 36;
/** 快速轻扫的速度阈值（像素 / 毫秒）与最小位移 */
export const SHEET_FLICK_VELOCITY = 0.5;
export const SHEET_FLICK_MIN_DISTANCE = 12;

/**
 * 手牌坞拖动结束后的去向：收起态向上拖展开，展开态向下拖收起；
 * 距离不够但速度够快的轻扫同样生效；其余保持原状（返回 null）。
 * movementY 向下为正。
 */
export function sheetDragOutcome(input: {
  open: boolean;
  movementY: number;
  velocityY: number;
}): 'open' | 'close' | null {
  const { open, movementY, velocityY } = input;
  const fastEnough = velocityY >= SHEET_FLICK_VELOCITY;
  if (!open) {
    const up = -movementY;
    if (up >= SHEET_DRAG_DISTANCE || (fastEnough && up >= SHEET_FLICK_MIN_DISTANCE)) return 'open';
    return null;
  }
  if (movementY >= SHEET_DRAG_DISTANCE || (fastEnough && movementY >= SHEET_FLICK_MIN_DISTANCE)) {
    return 'close';
  }
  return null;
}
