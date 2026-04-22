// 围坐桌面座位坐标算法（纯函数，脱离 React）
// 对照：plans/design/06c-match-table-layout.md §3

export interface Seat {
  id: string;
  /** 舞台百分比坐标 x ∈ [0, 1] */
  x: number;
  /** 舞台百分比坐标 y ∈ [0, 1] */
  y: number;
  /** 座位类型：顶中央（梦主）/ 底中央（viewer）/ 环上（其他盗梦者） */
  slot: 'top' | 'bottom' | 'ring';
  isViewer: boolean;
  isMaster: boolean;
  /** 仅 ring 有：环上角度（度），用于入场动画方向推导 */
  angleDeg?: number;
}

export interface ComputeSeatsOpts {
  playerOrder: string[];
  viewerID: string;
  masterID: string;
}

// 椭圆几何常量
const CX = 0.5;
const CY = 0.5;
const RX = 0.42;
const RY = 0.38;
const TOP_Y = 0.1;
const BOTTOM_Y = 0.9;

/**
 * 计算所有座位的舞台百分比坐标。
 *
 * 规则：
 *   - 梦主固定顶中央 (0.5, 0.1)；若 viewer 自己是梦主则不渲染顶中央 seat
 *   - viewer 固定底中央 (0.5, 0.9)
 *   - 其余盗梦者沿椭圆弧段均分；弧段根据 n 奇偶动态调整以避开正上方（与梦主冲突）
 *
 * @returns 按 seats.push 顺序：[master（可选）, viewer, ...thieves]；调用方按此顺序渲染即可
 */
export function computeSeats(opts: ComputeSeatsOpts): Seat[] {
  const { playerOrder, viewerID, masterID } = opts;
  const isViewerMaster = viewerID === masterID;
  const thieves = playerOrder.filter((id) => id !== viewerID && id !== masterID);
  const seats: Seat[] = [];

  // 1. 梦主顶中央（viewer 自己是梦主 → 不渲染，由 ActionDock 承载）
  if (!isViewerMaster && masterID) {
    seats.push({
      id: masterID,
      x: CX,
      y: TOP_Y,
      slot: 'top',
      isViewer: false,
      isMaster: true,
    });
  }

  // 2. viewer 底中央
  if (viewerID) {
    seats.push({
      id: viewerID,
      x: CX,
      y: BOTTOM_Y,
      slot: 'bottom',
      isViewer: true,
      isMaster: isViewerMaster,
    });
  }

  // 3. 盗梦者沿椭圆弧段
  const n = thieves.length;
  if (n === 0) return seats;

  const { startDeg, endDeg } = pickArcRange(n, isViewerMaster);

  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    seats.push({
      id: thieves[i]!,
      x: CX + RX * Math.cos(rad),
      y: CY - RY * Math.sin(rad),
      slot: 'ring',
      isViewer: false,
      isMaster: false,
      angleDeg: deg,
    });
  }
  return seats;
}

/**
 * 选择椭圆弧段起止角度：
 *   - viewer 是梦主时（顶中央无节点冲突）：标准弧段 [200°, -20°]
 *   - viewer 是盗梦者 + n 偶数：标准弧段 [200°, -20°]
 *   - viewer 是盗梦者 + n 奇数：拉宽弧段 [210°, -30°]，避开正上方 90°
 */
export function pickArcRange(
  n: number,
  isViewerMaster: boolean,
): { startDeg: number; endDeg: number } {
  if (isViewerMaster) return { startDeg: 200, endDeg: -20 };
  if (n % 2 === 1) return { startDeg: 210, endDeg: -30 };
  return { startDeg: 200, endDeg: -20 };
}
