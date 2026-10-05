// 解封响应 · 纯逻辑层
// 对照：docs/manual/04-action-cards.md §解封 效果②
//
// 触发：当 pendingResponseWindow.sourceAbilityID='action_unlock_effect_1'
//   且 viewerPlayerID 在 responders 中且未响应时，显示 banner。
// 行为：两个按钮 — 使用【解封】抵消（需持牌）/ 跳过。
//
// 特别注意：respondCancelUnlock / passResponse 不带参数，响应者就是发起这个 move 的玩家；
//   客户端以真人玩家的身份发出，引擎按行动权表确认他在响应窗口里且尚未响应。

import type { MatchView } from '@icgame/game-engine';

/** 解封响应 banner 计算结果（纯函数 · 便于测试） */
export interface UnlockResponseBannerState {
  visible: boolean;
  /** 发起解封者的 playerID */
  unlockerID: string | null;
  /** 解封层数（0-4） */
  layer: number | null;
  /** 当前玩家手中是否持有 action_unlock → 决定"抵消"按钮是否可点 */
  canCancel: boolean;
  /** 剩余未响应玩家数（含 viewer 自己）*/
  remainingResponders: number;
  /** 响应窗口配置的超时毫秒数（从 pendingResponseWindow.timeoutMs 透传）
   *  供 banner 侧做本地倒计时 + 到期自动 passResponse 用。
   *  不参与规则判定，仅用于 UI 体验；未来 server BGIO 实装后由 WindowTimerManager 兜底。 */
  timeoutMs: number;
}

const UNLOCK_CARD = 'action_unlock';

export function computeUnlockResponseState(
  G: MatchView | null | undefined,
  viewerPlayerID: string,
): UnlockResponseBannerState {
  const empty: UnlockResponseBannerState = {
    visible: false,
    unlockerID: null,
    layer: null,
    canCancel: false,
    remainingResponders: 0,
    timeoutMs: 0,
  };
  if (!G) return empty;
  const prw = G.pendingResponseWindow;
  if (!prw) return empty;
  if (prw.sourceAbilityID !== 'action_unlock_effect_1') return empty;
  if (!prw.responders.includes(viewerPlayerID)) return empty;
  if (prw.responded.includes(viewerPlayerID)) return empty;

  const viewer = G.players[viewerPlayerID];
  const hand = (viewer?.hand as readonly string[] | undefined) ?? [];
  const canCancel = !!viewer?.isAlive && hand.includes(UNLOCK_CARD);

  const pendingUnlock = G.pendingUnlock;
  const remainingResponders = prw.responders.filter((id) => !prw.responded.includes(id)).length;

  return {
    visible: true,
    unlockerID: pendingUnlock?.playerID ?? null,
    layer: pendingUnlock?.layer ?? null,
    canCancel,
    remainingResponders,
    timeoutMs: prw.timeoutMs,
  };
}
