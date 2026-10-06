// 「陀螺未停」的陀螺仪读数：牌库剩余落成一圈表圈的描边长度，纯函数、与界面无关
//
// 表圈是一个半径 GAUGE_RADIUS 的圆，从正上方顺时针走，描边长度 = 剩余比例 × 周长。

export const GAUGE_RADIUS = 64;
export const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

/** 表圈刻度：每 30 度一格，共 12 格（度数，从正上方起顺时针） */
export const GAUGE_TICKS: readonly number[] = Array.from({ length: 12 }, (_, i) => i * 30);

/** 牌库剩余比例，夹在 0–1；任一数值无效时为 0 */
export function deckRatio(remaining: number, total: number): number {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, remaining / total));
}

/** 牌库剩余百分比（取整） */
export function deckPercent(remaining: number, total: number): number {
  return Math.round(deckRatio(remaining, total) * 100);
}

/** 表圈描边的 stroke-dashoffset：满牌库为 0（整圈），空牌库为一整圈（不显示） */
export function gaugeDashOffset(remaining: number, total: number): number {
  return GAUGE_CIRCUMFERENCE * (1 - deckRatio(remaining, total));
}
