// 对局正在等某位玩家应答时，推导是否轮到本人（用于等待提示与动态栏）；本人的操作界面见 response/awaitedResponse.ts。
// 点名以视图字段的实际形状为准；对本人不可见的点名（视图里为 null）一律视为不是本人。
// 共鸣只是回合末自动结算的标记，不需要任何人应答，不在此列。
// 金币金库的三选一等的是梦主，梦主的操作界面是 MasterNightmareDecisionDialog（弹窗），
// 所以轮到梦主时标 hasOwnUi，等待提示不再叠一条「暂时无法操作」。

import type { MatchView } from '@icgame/game-engine';

export interface AwaitingNotice {
  /** 是否轮到本人应答 */
  mine: boolean;
  /** 等的是梦主（土星·律令的应答窗口）：别人看到的提示写明在等梦主 */
  master?: true;
  /** 轮到本人时，操作界面是自己的弹窗（不经应答窗口 / 响应条），等待提示不必再显示 */
  hasOwnUi?: true;
}

interface Awaited {
  /** 点名的座位；对本人不可见时为 null */
  seat: string | null;
  /** 轮到该座位时，是否有独立的弹窗承担操作 */
  hasOwnUi?: true;
  /** 等的是梦主 */
  master?: true;
}

/** 当前正在等待应答的座位；没有待决状态返回 undefined。可以由多人同时应答的待决（黑洞·吞噬）按本人是否在名单里判断 */
function awaitedSeat(view: MatchView, mySeat: string | null): Awaited | undefined {
  // 阻塞类先判断，白羊选择不挡住回合主人，放最后
  if (view.pendingShootResponse) return { seat: view.pendingShootResponse.targetPlayerID };
  if (view.pendingLibra) {
    // 目标先分牌，分牌后由发动者选一份
    return {
      seat: view.pendingLibra.split
        ? view.pendingLibra.bonderPlayerID
        : view.pendingLibra.targetPlayerID,
    };
  }
  if (view.pendingSudgerRolls) return { seat: view.currentPlayerID };
  if (view.pendingVirgoChoice) return { seat: view.pendingVirgoChoice.virgoID };
  // 黑洞·吞噬：名单里的人各自交牌；本人在名单里就是本人，否则点名名单里的第一个人
  if (view.pendingBlackHoleLevy) {
    const { waiting } = view.pendingBlackHoleLevy;
    return { seat: mySeat !== null && waiting.includes(mySeat) ? mySeat : (waiting[0] ?? null) };
  }
  // 雅典娜是谁只有她本人看得到（视图里为 null）
  if (view.pendingAthenaWit) return { seat: view.pendingAthenaWit.athenaID };
  if (view.pendingDarwinReturn) return { seat: view.pendingDarwinReturn.playerID };
  // 土星·律令：被问的是梦主，梦主是谁本来就公开
  if (view.pendingSaturnDecree) return { seat: view.pendingSaturnDecree.masterID, master: true };
  // 金币金库三选一、梦境窥视是否派贿赂：都等梦主，梦主各有自己的弹窗
  if (view.pendingVaultDecision) return { seat: view.dreamMasterID, hasOwnUi: true };
  if (view.pendingPeekDecision) return { seat: view.dreamMasterID, hasOwnUi: true };
  if (view.pendingAriesChoice) return { seat: view.pendingAriesChoice.ariesID };
  return undefined;
}

export function awaitingNotice(view: MatchView, seat: string | null): AwaitingNotice | null {
  const awaited = awaitedSeat(view, seat);
  if (awaited === undefined) return null;
  const mine = seat !== null && awaited.seat !== null && awaited.seat === seat;
  const masterFlag = awaited.master ? ({ master: true } as const) : {};
  return mine && awaited.hasOwnUi ? { mine, hasOwnUi: true } : { mine, ...masterFlag };
}
