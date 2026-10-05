// 梦主查看盗梦者贿赂牌 banner · 纯逻辑层
// 对照：docs/manual/04-action-cards.md §梦境窥视 效果②
// "仅梦主使用，查看一名盗梦者的所有贿赂牌。"
//
// 触发：peekReveal 挂起 + revealKind='bribe' + viewer 是 peekerID(=梦主)
//   展示 targetThiefID 名下所有 bribe 的成败：视图里成败只在 kind 上，看不到时为 null。

import type { MatchView } from '@icgame/game-engine';

export interface MasterBribeInspectBannerState {
  visible: boolean;
  targetThiefID: string | null;
  bribes: Array<{
    id: string;
    /** 成败；视图没有给出时为 null（按「未知」展示） */
    kind: 'deal' | 'fail' | null;
  }>;
}

export function computeMasterBribeInspectState(
  G: MatchView | null | undefined,
  viewerPlayerID: string,
): MasterBribeInspectBannerState {
  const empty: MasterBribeInspectBannerState = {
    visible: false,
    targetThiefID: null,
    bribes: [],
  };
  if (!G) return empty;
  const pr = G.peekReveal;
  if (!pr) return empty;
  if (pr.revealKind !== 'bribe') return empty;
  if (pr.peekerID !== viewerPlayerID) return empty;

  const bribes = G.bribePool
    .filter((b) => b.heldBy === pr.targetThiefID)
    .map((b) => ({ id: b.id, kind: b.kind }));

  return {
    visible: true,
    targetThiefID: pr.targetThiefID,
    bribes,
  };
}
