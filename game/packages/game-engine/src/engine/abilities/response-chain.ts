// 响应链框架 — 统一响应窗口模型
// 对照：plans/design/02-game-rules-spec.md §2.4.2 / 05-card-system.md §5.4.6
// 取消解封 / SHOOT 响应 / 链式触发的通用容器

import type { SetupState } from '../../setup.js';
import type { PendingResponse } from './types.js';

/** 响应窗口状态（挂载到 SetupState 上） */
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
}

/** 创建响应窗口 */
export function openResponseWindow(state: SetupState, pending: PendingResponse): SetupState {
  const window: ResponseWindowState = {
    sourceAbilityID: pending.sourceAbilityID,
    responders: pending.responders,
    responded: [],
    timeoutMs: pending.timeoutMs,
    validResponseAbilityIDs: pending.validResponseAbilityIDs,
    onTimeout: pending.onTimeout,
  };
  return {
    ...state,
    pendingResponseWindow: window,
  };
}

/** 玩家 pass（不响应） */
export function passOnResponse(state: SetupState, playerID: string): SetupState {
  const w = state.pendingResponseWindow;
  if (!w) return state;
  if (!w.responders.includes(playerID)) return state;

  const updated: ResponseWindowState = {
    ...w,
    responded: [...w.responded, playerID],
  };

  // 所有人都 pass → 超时逻辑（resolve = 继续执行原始能力）
  if (updated.responded.length >= updated.responders.length) {
    return { ...state, pendingResponseWindow: null };
  }

  return { ...state, pendingResponseWindow: updated };
}

/** 玩家响应（使用响应能力） */
export function respondToWindow(
  state: SetupState,
  playerID: string,
  responseAbilityID: string,
): { state: SetupState; resolved: boolean } {
  const w = state.pendingResponseWindow;
  if (!w) return { state, resolved: false };
  if (!w.responders.includes(playerID)) return { state, resolved: false };
  if (!w.validResponseAbilityIDs.includes(responseAbilityID)) return { state, resolved: false };

  // 有人响应 → 窗口关闭，onTimeout='cancel' 时取消原始效果
  return {
    state: { ...state, pendingResponseWindow: null },
    resolved: true,
  };
}

/** 检查窗口是否所有人都已响应（用于超时处理） */
export function isWindowComplete(state: SetupState): boolean {
  const w = state.pendingResponseWindow;
  if (!w) return true;
  return w.responded.length >= w.responders.length;
}

/** 超时处理：按 onTimeout 决定 */
export function handleTimeout(state: SetupState): {
  state: SetupState;
  action: 'resolve' | 'cancel';
} {
  const w = state.pendingResponseWindow;
  if (!w) return { state, action: 'resolve' };

  return {
    state: { ...state, pendingResponseWindow: null },
    action: w.onTimeout,
  };
}
