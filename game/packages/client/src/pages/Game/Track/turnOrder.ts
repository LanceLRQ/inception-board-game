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
 *   - viewer 是盗梦者时：梦主放在首位，其余盗梦者（含 viewer 自己）按 playerOrder 接在后面
 *   - viewer 是梦主时：不再重复放梦主 slot，直接按 playerOrder 走
 *   - viewer 自己也出现在 Rail（方便查看自己在顺序中的位置），仅通过 `isViewer` 标志位做视觉强调
 */
export function computeRailSlots(opts: ComputeRailSlotsOpts): RailSlotData[] {
  const { playerOrder, viewerID, masterID, currentPlayerID } = opts;
  const isViewerMaster = viewerID === masterID;

  const orderedIds: string[] = [];

  if (!isViewerMaster && masterID) {
    orderedIds.push(masterID);
  }

  for (const pid of playerOrder) {
    if (pid === masterID && !isViewerMaster) continue; // 已放首位
    orderedIds.push(pid);
  }

  return orderedIds.map((id, index) => ({
    id,
    isViewer: id === viewerID,
    isMaster: id === masterID,
    isCurrent: id === currentPlayerID,
    index,
  }));
}
