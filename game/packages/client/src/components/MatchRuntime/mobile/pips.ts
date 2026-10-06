// 心锁骰的点阵：骰面 1-6 的点位（百分比坐标）

const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [26, 26],
    [50, 50],
    [74, 74],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [26, 26],
    [74, 26],
    [50, 50],
    [26, 74],
    [74, 74],
  ],
  6: [
    [30, 24],
    [30, 50],
    [30, 76],
    [70, 24],
    [70, 50],
    [70, 76],
  ],
};

/** 某个心锁值对应的点位；超过 6 按 6 画，0 及以下没有点（已解开） */
export function pipsFor(value: number): ReadonlyArray<readonly [number, number]> {
  const v = Math.min(6, Math.floor(value));
  return v >= 1 ? (PIPS[v] ?? []) : [];
}
