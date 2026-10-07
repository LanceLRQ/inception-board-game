// 梦境窥视派贿赂决策 banner · 纯逻辑层
// 对照：docs/manual/04-action-cards.md §梦境窥视 解析
// 触发：pendingPeekDecision 挂起 + viewer 是梦主 → 弹出决策（派 / 跳过）
//
// 说明：只有 bribePool 中有 inPool 的贿赂时 playPeek 才会挂起 pendingPeekDecision
//   （engine 已在 playPeek 分支处理）。若派完则直接挂 peekReveal 跳过本 banner。

import type { MatchView } from '@icgame/game-engine';

/** 皇城梦主可指定的一张池内贿赂牌：index 是它在贿赂池数组里的下标（move 的 poolIndex） */
export interface PoolChoice {
  index: number;
  kind: 'deal' | 'fail';
}

/**
 * 皇城梦主能看到池内每张未派出的牌的成败，可以指定其中一张；
 * 视图里看不到成败（非皇城）或池里没有未派出的牌时返回 null，只能随机派发。
 * 对照：docs/manual/06-dream-master.md 皇城
 */
export function imperialPoolChoices(G: MatchView): PoolChoice[] | null {
  const choices: PoolChoice[] = [];
  G.bribePool.forEach((b, index) => {
    if (b.status === 'inPool' && b.kind !== null) choices.push({ index, kind: b.kind });
  });
  return choices.length > 0 ? choices : null;
}

/** masterPeekBribeDecision 的参数：跳过 / 随机派发 / 指定池里一张（皇城） */
export function peekBribeDecisionArgs(deal: boolean, poolIndex: number | null): unknown[] {
  return deal && poolIndex !== null ? [true, poolIndex] : [deal];
}

export interface MasterPeekBribeBannerState {
  visible: boolean;
  peekerID: string | null;
  layer: number | null;
  /** bribePool 中 inPool 的贿赂数（派发池深度） */
  inPoolCount: number;
  /** 皇城梦主可指定的牌；看不到池内成败时为 null */
  poolChoices: PoolChoice[] | null;
}

export function computeMasterPeekBribeState(
  G: MatchView | null | undefined,
  viewerPlayerID: string,
): MasterPeekBribeBannerState {
  const empty: MasterPeekBribeBannerState = {
    visible: false,
    peekerID: null,
    layer: null,
    inPoolCount: 0,
    poolChoices: null,
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
    poolChoices: imperialPoolChoices(G),
  };
}
