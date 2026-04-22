// seatLayout 纯函数测试
// 对照：plans/design/06c-match-table-layout.md §3.4

import { describe, it, expect } from 'vitest';
import { computeSeats, pickArcRange, type Seat } from './seatLayout.js';

function makeOrder(n: number, masterFirst = false): string[] {
  // 'M' 是梦主；盗梦者 T1..Tn-1
  const thieves = Array.from({ length: n - 1 }, (_, i) => `T${i + 1}`);
  return masterFirst ? ['M', ...thieves] : [...thieves, 'M'];
}

describe('pickArcRange', () => {
  it('viewer 是梦主：永远返回标准弧段 [200, -20]', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(pickArcRange(n, true)).toEqual({ startDeg: 200, endDeg: -20 });
    }
  });

  it('viewer 是盗梦者 + n 偶数：标准弧段 [200, -20]', () => {
    expect(pickArcRange(2, false)).toEqual({ startDeg: 200, endDeg: -20 });
    expect(pickArcRange(4, false)).toEqual({ startDeg: 200, endDeg: -20 });
    expect(pickArcRange(6, false)).toEqual({ startDeg: 200, endDeg: -20 });
    expect(pickArcRange(8, false)).toEqual({ startDeg: 200, endDeg: -20 });
  });

  it('viewer 是盗梦者 + n 奇数：拉宽弧段 [210, -30]', () => {
    expect(pickArcRange(1, false)).toEqual({ startDeg: 210, endDeg: -30 });
    expect(pickArcRange(3, false)).toEqual({ startDeg: 210, endDeg: -30 });
    expect(pickArcRange(5, false)).toEqual({ startDeg: 210, endDeg: -30 });
    expect(pickArcRange(7, false)).toEqual({ startDeg: 210, endDeg: -30 });
  });
});

describe('computeSeats · 基础结构', () => {
  it('viewer 是盗梦者：梦主顶中央 + viewer 底中央 + 环上 n-2 个', () => {
    // 8 人房：M + T1..T7，viewer = T1
    const seats = computeSeats({
      playerOrder: ['M', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      viewerID: 'T1',
      masterID: 'M',
    });

    // 长度：1 master + 1 viewer + 6 rings = 8
    expect(seats).toHaveLength(8);

    const master = seats.find((s) => s.isMaster)!;
    expect(master).toMatchObject({
      id: 'M',
      x: 0.5,
      y: 0.1,
      slot: 'top',
      isViewer: false,
    });

    const viewer = seats.find((s) => s.isViewer)!;
    expect(viewer).toMatchObject({
      id: 'T1',
      x: 0.5,
      y: 0.9,
      slot: 'bottom',
      isMaster: false,
    });

    const rings = seats.filter((s) => s.slot === 'ring');
    expect(rings).toHaveLength(6);
    expect(rings.map((s) => s.id)).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
  });

  it('viewer 是梦主：不渲染顶中央；仅 viewer 底 + 环上所有盗梦者', () => {
    const seats = computeSeats({
      playerOrder: ['M', 'T1', 'T2', 'T3', 'T4'],
      viewerID: 'M',
      masterID: 'M',
    });

    // viewer (master) + 4 rings = 5
    expect(seats).toHaveLength(5);
    expect(seats.filter((s) => s.slot === 'top')).toHaveLength(0);

    const viewer = seats.find((s) => s.isViewer)!;
    expect(viewer).toMatchObject({
      id: 'M',
      slot: 'bottom',
      isMaster: true,
      isViewer: true,
    });

    const rings = seats.filter((s) => s.slot === 'ring');
    expect(rings.map((s) => s.id)).toEqual(['T1', 'T2', 'T3', 'T4']);
  });

  it('边界 n=2（1 梦主 + 1 盗梦者 viewer）：无环上节点', () => {
    const seats = computeSeats({
      playerOrder: ['M', 'T1'],
      viewerID: 'T1',
      masterID: 'M',
    });
    expect(seats).toHaveLength(2);
    expect(seats.filter((s) => s.slot === 'ring')).toHaveLength(0);
  });

  it('边界 n=1（仅 viewer=master，无盗梦者）：只有 viewer 自己', () => {
    const seats = computeSeats({
      playerOrder: ['M'],
      viewerID: 'M',
      masterID: 'M',
    });
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({ id: 'M', isViewer: true, isMaster: true });
  });
});

describe('computeSeats · 坐标对称性', () => {
  function assertSymmetry(rings: Seat[]) {
    // 按 angleDeg 降序（从左到右）
    const sorted = [...rings].sort((a, b) => (b.angleDeg ?? 0) - (a.angleDeg ?? 0));
    const n = sorted.length;
    for (let i = 0; i < Math.floor(n / 2); i++) {
      const left = sorted[i]!;
      const right = sorted[n - 1 - i]!;
      // 相对 x=0.5 镜像对称
      expect(left.x + right.x).toBeCloseTo(1, 5);
      // y 相等（同一横线）
      expect(left.y).toBeCloseTo(right.y, 5);
    }
  }

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10])('n=%i 盗梦者 viewer：环上节点左右对称', (total) => {
    const order = makeOrder(total);
    const seats = computeSeats({
      playerOrder: order,
      viewerID: 'T1',
      masterID: 'M',
    });
    const rings = seats.filter((s) => s.slot === 'ring');
    if (rings.length >= 2) assertSymmetry(rings);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10])('n=%i viewer=master：环上节点左右对称', (total) => {
    const order = makeOrder(total);
    const seats = computeSeats({
      playerOrder: order,
      viewerID: 'M',
      masterID: 'M',
    });
    const rings = seats.filter((s) => s.slot === 'ring');
    if (rings.length >= 2) assertSymmetry(rings);
  });
});

describe('computeSeats · 弧段切换', () => {
  it('奇数 n（viewer 盗梦者）角度落在拉宽弧段 [210, -30] 内', () => {
    const seats = computeSeats({
      playerOrder: ['M', 'T1', 'T2', 'T3', 'T4'], // n_ring=3
      viewerID: 'T1',
      masterID: 'M',
    });
    const rings = seats.filter((s) => s.slot === 'ring');
    for (const s of rings) {
      expect(s.angleDeg ?? 0).toBeGreaterThanOrEqual(-30);
      expect(s.angleDeg ?? 0).toBeLessThanOrEqual(210);
    }
  });

  it('偶数 n（viewer 盗梦者）角度落在标准弧段 [200, -20] 内', () => {
    const seats = computeSeats({
      playerOrder: ['M', 'T1', 'T2', 'T3', 'T4', 'T5'], // n_ring=4
      viewerID: 'T1',
      masterID: 'M',
    });
    const rings = seats.filter((s) => s.slot === 'ring');
    for (const s of rings) {
      expect(s.angleDeg ?? 0).toBeGreaterThanOrEqual(-20);
      expect(s.angleDeg ?? 0).toBeLessThanOrEqual(200);
    }
  });
});

describe('computeSeats · 坐标范围', () => {
  it('所有 seat 的 x/y 都在 [0, 1] 之间', () => {
    const seats = computeSeats({
      playerOrder: ['M', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'],
      viewerID: 'T1',
      masterID: 'M',
    });
    for (const s of seats) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(1);
    }
  });
});
