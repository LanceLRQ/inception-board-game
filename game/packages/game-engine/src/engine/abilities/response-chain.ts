// 响应链框架 — 统一响应窗口模型（栈式）
// 对照：plans/design/02-game-rules-spec.md §2.4.2 / 05-card-system.md §5.4.6
// 取消解封 / SHOOT 响应 / 链式触发的通用容器
//
// 栈式语义：当已有窗口时再开新窗口，新窗口挂到栈顶，旧窗口通过 parentWindow 保留；
// 新窗口关闭（响应/全员 pass/超时）时自动回退到 parentWindow。
// 外部消费者仍通过 state.pendingResponseWindow 读取当前（栈顶）窗口 — 向后兼容。

import type { SetupState } from '../../setup.js';
import type { PendingResponse } from './types.js';

/** 响应窗口状态（挂载到 SetupState 上；parentWindow 形成链表表达嵌套栈） */
export interface ResponseWindowState {
  /** 触发的来源能力 ID（如 "action_unlock"） */
  sourceAbilityID: string;
  /** 等待响应的玩家列表 */
  responders: string[];
  /** 已响应的玩家（含 pass/act） */
  responded: string[];
  /** 超时毫秒 */
  timeoutMs: number;
  /** 可用的响应能力 ID */
  validResponseAbilityIDs: string[];
  /** 超时默认行为 */
  onTimeout: 'resolve' | 'cancel';
  /** 父窗口 — 栈式嵌套时保留外层窗口，关闭当前窗口时回退（null/undefined 表示栈底） */
  parentWindow?: ResponseWindowState | null;
}

/** 创建响应窗口 — 若已有活跃窗口，将其挂为 parentWindow（栈式入栈） */
export function openResponseWindow(state: SetupState, pending: PendingResponse): SetupState {
  const parent = state.pendingResponseWindow ?? null;
  const window: ResponseWindowState = {
    sourceAbilityID: pending.sourceAbilityID,
    responders: pending.responders,
    responded: [],
    timeoutMs: pending.timeoutMs,
    validResponseAbilityIDs: pending.validResponseAbilityIDs,
    onTimeout: pending.onTimeout,
    parentWindow: parent,
  };
  return {
    ...state,
    pendingResponseWindow: window,
  };
}

/** 玩家 pass（不响应） — 关闭时回退到 parentWindow */
export function passOnResponse(state: SetupState, playerID: string): SetupState {
  const w = state.pendingResponseWindow;
  if (!w) return state;
  if (!w.responders.includes(playerID)) return state;

  const updated: ResponseWindowState = {
    ...w,
    responded: [...w.responded, playerID],
  };

  // 所有人都 pass → 关闭当前窗口，回退到 parentWindow（可能为 null）
  if (updated.responded.length >= updated.responders.length) {
    return { ...state, pendingResponseWindow: w.parentWindow ?? null };
  }

  return { ...state, pendingResponseWindow: updated };
}

/** 玩家响应（使用响应能力） — 关闭时回退到 parentWindow */
export function respondToWindow(
  state: SetupState,
  playerID: string,
  responseAbilityID: string,
): { state: SetupState; resolved: boolean } {
  const w = state.pendingResponseWindow;
  if (!w) return { state, resolved: false };
  if (!w.responders.includes(playerID)) return { state, resolved: false };
  if (!w.validResponseAbilityIDs.includes(responseAbilityID)) return { state, resolved: false };

  // 有人响应 → 窗口关闭（onTimeout='cancel' 时取消原始效果），回退 parentWindow
  return {
    state: { ...state, pendingResponseWindow: w.parentWindow ?? null },
    resolved: true,
  };
}

/** 检查栈顶窗口是否所有人都已响应（用于超时处理） */
export function isWindowComplete(state: SetupState): boolean {
  const w = state.pendingResponseWindow;
  if (!w) return true;
  return w.responded.length >= w.responders.length;
}

/** 超时处理：按 onTimeout 决定；关闭栈顶窗口后回退 parentWindow */
export function handleTimeout(state: SetupState): {
  state: SetupState;
  action: 'resolve' | 'cancel';
} {
  const w = state.pendingResponseWindow;
  if (!w) return { state, action: 'resolve' };

  return {
    state: { ...state, pendingResponseWindow: w.parentWindow ?? null },
    action: w.onTimeout,
  };
}

// ============================================================================
// 栈式辅助（W19 · 响应链嵌套子系统）
// ============================================================================

/** 获取当前栈顶活跃窗口（与直接读 state.pendingResponseWindow 等价，语义更清晰） */
export function getActiveWindow(state: SetupState): ResponseWindowState | null {
  return state.pendingResponseWindow ?? null;
}

/** 获取父窗口（栈中倒数第二层） */
export function getParentWindow(state: SetupState): ResponseWindowState | null {
  return state.pendingResponseWindow?.parentWindow ?? null;
}

/** 计算响应窗口栈深度（0 = 无窗口；1 = 单窗口；2+ = 嵌套） */
export function getWindowDepth(state: SetupState): number {
  let depth = 0;
  let cur: ResponseWindowState | null | undefined = state.pendingResponseWindow;
  while (cur) {
    depth += 1;
    cur = cur.parentWindow ?? null;
  }
  return depth;
}
