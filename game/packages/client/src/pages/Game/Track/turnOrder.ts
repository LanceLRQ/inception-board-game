// 移动端行动轴的 slot 顺序计算（纯函数）
// 对照：plans/design/06c-match-table-layout.md §4

import type { MockPlayer } from '../../../hooks/useMockMatch.js';

export interface RailSlotData {
  id: string;
  isViewer: boolean;
  isMaster: boolean;
  isCurrent: boolean;
  /** 顺序索引（0 基） */
  index: number;
}

export interface ComputeRailSlotsOpts {
  playerOrder: string[];
  players: Record<string, MockPlayer | undefined>;
  viewerID: string;
  masterID: string;
  currentPlayerID: string;
}

/**
 * 计算移动端行动轴 slot 序列：
 *   - viewer 是盗梦者时：梦主放在首位，其余盗梦者按 playerOrder 接在后面
 *   - viewer 是梦主时：不放梦主 slot，直接从 playerOrder 中的盗梦者开始
 *   - viewer 本身始终不出现在 Rail（由底部 ActionDock 承载）
 */
export function computeRailSlots(opts: ComputeRailSlotsOpts): RailSlotData[] {
  const { playerOrder, viewerID, masterID, currentPlayerID } = opts;
  const isViewerMaster = viewerID === masterID;

  const orderedIds: string[] = [];

  if (!isViewerMaster && masterID) {
    orderedIds.push(masterID);
  }

  for (const pid of playerOrder) {
    if (pid === viewerID) continue;
    if (pid === masterID && !isViewerMaster) continue; // 已放首位
    orderedIds.push(pid);
  }

  return orderedIds.map((id, index) => ({
    id,
    isViewer: false,
    isMaster: id === masterID,
    isCurrent: id === currentPlayerID,
    index,
  }));
}
