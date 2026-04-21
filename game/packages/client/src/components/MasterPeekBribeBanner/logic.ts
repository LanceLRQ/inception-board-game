// 梦境窥视派贿赂决策 banner · 纯逻辑层
// 对照：docs/manual/04-action-cards.md §梦境窥视 解析
// 触发：pendingPeekDecision 挂起 + viewer 是梦主 → 弹出决策（派 / 跳过）
//
// 说明：只有 bribePool 中有 inPool 的贿赂时 playPeek 才会挂起 pendingPeekDecision
//   （engine 已在 playPeek 分支处理）。若派完则直接挂 peekReveal 跳过本 banner。

import type { SetupState } from '@icgame/game-engine';

export interface MasterPeekBribeBannerState {
  visible: boolean;
  peekerID: string | null;
  layer: number | null;
  /** bribePool 中 inPool 的贿赂数（派发池深度） */
  inPoolCount: number;
}

export function computeMasterPeekBribeState(
  G: SetupState | null | undefined,
  viewerPlayerID: string,
): MasterPeekBribeBannerState {
  const empty: MasterPeekBribeBannerState = {
    visible: false,
    peekerID: null,
    layer: null,
    inPoolCount: 0,
  };
  if (!G) return empty;
  const ppd = G.pendingPeekDecision;
  if (!ppd) return empty;
  // 仅梦主看得到
  if (viewerPlayerID !== G.dreamMasterID) return empty;

  const inPoolCount = G.bribePool.filter((b) => b.status === 'inPool').length;
  return {
    visible: true,
    peekerID: ppd.peekerID,
    layer: ppd.targetLayer,
    inPoolCount,
  };
}
