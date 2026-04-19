// 响应窗口超时 & AI 接管阈值 - 默认行为
// 对照：plans/design/02-game-rules-spec.md §2.6 响应窗口 / plans/design/08-security-ai.md §8.5 AI 接管
//
// 三级超时：
//   RESPONSE_WINDOW_MS   = 30_000  响应窗口超时 → 默认 pass（应用 unlock 成功）
//   AI_TAKEOVER_MS       = 60_000  真人静默 → 傻 AI L0 接管
//   DISCONNECT_FORCE_MS  = 180_000 断线分级：3 min 硬关（踢出或永久 AI）

import type { SetupState } from '../setup.js';
import { applyUnlockSuccess, applyUnlockCancel } from '../moves.js';

export const RESPONSE_WINDOW_MS = 30_000;
export const AI_TAKEOVER_MS = 60_000;
export const DISCONNECT_FORCE_MS = 180_000;

export type TimeoutDefault = 'pass' | 'cancel';

/**
 * 响应窗口超时默认：无人响应时按 TimeoutDefault 应用规则。
 * 默认语义：pass（让解封成功）。
 */
export function applyResponseTimeout(
  state: SetupState,
  defaultBehavior: TimeoutDefault = 'pass',
): SetupState {
  if (!state.pendingUnlock) return state;
  if (defaultBehavior === 'cancel') {
    return applyUnlockCancel(state);
  }
  return applyUnlockSuccess(state);
}

/** 记录玩家最后活动时间（在 server 层持久化，此处定义纯接口） */
export interface PresenceInfo {
  readonly playerID: string;
  readonly lastActivityAt: number; // ms epoch
  readonly isAiControlled: boolean;
}

/** 判定某玩家是否应进入 AI 托管 */
export function shouldTakeover(info: PresenceInfo, nowMs: number): boolean {
  if (info.isAiControlled) return false;
  return nowMs - info.lastActivityAt >= AI_TAKEOVER_MS;
}

/** 判定是否应强制下线（3min） */
export function shouldForceDisconnect(info: PresenceInfo, nowMs: number): boolean {
  return nowMs - info.lastActivityAt >= DISCONNECT_FORCE_MS;
}
