// 没有操作界面的待决状态：对局正在等某位玩家应答时，给本人一条提示。
// 点名以视图字段的实际形状为准；对本人不可见的点名（视图里为 null）一律视为不是本人。
// 共鸣只是回合末自动结算的标记，不需要任何人应答，不在此列。

import type { MatchView } from '@icgame/game-engine';

export interface AwaitingNotice {
  /** 是否轮到本人应答 */
  mine: boolean;
}

/** 当前正在等待应答的座位；没有待决状态返回 undefined，点名对本人不可见返回 null */
function awaitedSeat(view: MatchView): string | null | undefined {
  // 阻塞类先判断，白羊选择不挡住回合主人，放最后
  if (view.pendingShootResponse) return view.pendingShootResponse.targetPlayerID;
  if (view.pendingLibra) {
    // 目标先分牌，分牌后由发动者选一份
    return view.pendingLibra.split
      ? view.pendingLibra.bonderPlayerID
      : view.pendingLibra.targetPlayerID;
  }
  if (view.pendingSudgerRolls) return view.currentPlayerID;
  if (view.pendingVirgoChoice) return view.pendingVirgoChoice.virgoID;
  if (view.pendingAriesChoice) return view.pendingAriesChoice.ariesID;
  return undefined;
}

export function awaitingNotice(view: MatchView, seat: string | null): AwaitingNotice | null {
  const awaited = awaitedSeat(view);
  if (awaited === undefined) return null;
  return { mine: seat !== null && awaited !== null && awaited === seat };
}
