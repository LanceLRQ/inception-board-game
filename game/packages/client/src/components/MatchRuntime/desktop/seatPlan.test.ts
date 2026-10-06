import { describe, it, expect } from 'vitest';
import type { CenterFootprint } from '../../../theme/skins/types';
import {
  EDGE_PAD,
  NOTICE_WIDTH,
  bubbleSpot,
  PLATE_SIZES,
  centerWidth,
  planSeats,
  seatsOverlap,
  type PlanInput,
  type PlannedSeat,
  type Rect,
} from './seatPlan';

const FOOTPRINT: CenterFootprint = {
  widthRatio: 0.36,
  minWidth: 340,
  maxWidth: 600,
  minHeight: 330,
};

/** 各视口里舞台的大致尺寸：视口高度减去片头条与底部坞 */
const STAGES = [
  { name: '1024x768', w: 1024, h: 530 },
  { name: '1280x800', w: 1280, h: 562 },
  { name: '1440x900', w: 1440, h: 637 },
  { name: '1920x1080', w: 1920, h: 772 },
];

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

function inputOf(
  stage: { w: number; h: number },
  players: number,
  viewerIsMaster = false,
  reserveRight = 0,
): PlanInput {
  // 玩家 = 梦主 + 盗梦者；本人不上环
  const thieves = viewerIsMaster ? players - 1 : players - 2;
  return {
    stage,
    thieves: ids(thieves),
    masterId: viewerIsMaster ? null : 'm',
    footprint: FOOTPRINT,
    reserveRight,
  };
}

const inside = (s: PlannedSeat, stage: { w: number; h: number }) =>
  s.x - s.w / 2 >= 0 && s.x + s.w / 2 <= stage.w && s.y - s.h / 2 >= 0 && s.y + s.h / 2 <= stage.h;

const intersectsRect = (s: PlannedSeat, r: Rect) =>
  Math.abs(s.x - (r.x + r.w / 2)) < (s.w + r.w) / 2 - 0.5 &&
  Math.abs(s.y - (r.y + r.h / 2)) < (s.h + r.h) / 2 - 0.5;

describe('planSeats · 不同视口与人数下的几何约束', () => {
  for (const stage of STAGES) {
    for (let players = 4; players <= 10; players++) {
      for (const viewerIsMaster of [false, true]) {
        it(`${stage.name} · ${players} 人${viewerIsMaster ? '（本人是梦主）' : ''}：不出界、不重叠、不压中央`, () => {
          const plan = planSeats(inputOf(stage, players, viewerIsMaster));
          const expected = viewerIsMaster ? players - 1 : players - 1; // 梦主上环时：梦主 + 其余盗梦者
          expect(plan.seats).toHaveLength(expected);
          for (const s of plan.seats) expect(inside(s, stage), s.id).toBe(true);
          for (let i = 0; i < plan.seats.length; i++) {
            for (let j = i + 1; j < plan.seats.length; j++) {
              expect(
                seatsOverlap(plan.seats[i]!, plan.seats[j]!),
                `${plan.seats[i]!.id} / ${plan.seats[j]!.id}`,
              ).toBe(false);
            }
          }
          for (const s of plan.seats) expect(intersectsRect(s, plan.center), s.id).toBe(false);
        });
      }
    }
  }
});

describe('planSeats · 提示栈与档位', () => {
  it('右上角有提示栈时，右列座位让到提示栈下方', () => {
    const stage = STAGES[1]!;
    const input = inputOf(stage, 8);
    const reserve = 160;
    const plan = planSeats({ ...input, reserveRight: reserve });
    for (const s of plan.seats.filter((x) => x.role === 'right')) {
      expect(s.y - s.h / 2).toBeGreaterThanOrEqual(EDGE_PAD + reserve - 0.5);
    }
    // 提示栈占据右上角，梦主牌与它不相撞
    const master = plan.seats.find((x) => x.role === 'master')!;
    expect(master.x + master.w / 2).toBeLessThan(stage.w - EDGE_PAD - NOTICE_WIDTH);
  });

  it('座位少、舞台大时用最大一档；座位多、舞台小时降档', () => {
    expect(planSeats(inputOf(STAGES[3]!, 4)).density).toBe('grand');
    expect(planSeats(inputOf(STAGES[0]!, 10)).density).toBe('compact');
  });

  it('梦主上环时居中在顶部，两侧人数相差不超过 1', () => {
    const plan = planSeats(inputOf(STAGES[1]!, 7));
    const master = plan.seats.find((s) => s.role === 'master')!;
    expect(master.x).toBe(STAGES[1]!.w / 2);
    expect(master.y - master.h / 2).toBe(EDGE_PAD);
    const left = plan.seats.filter((s) => s.role === 'left').length;
    const right = plan.seats.filter((s) => s.role === 'right').length;
    expect(left - right).toBeGreaterThanOrEqual(0);
    expect(left - right).toBeLessThanOrEqual(1);
  });

  it('本人是梦主时没有顶部座位，中央区从顶部开始', () => {
    const plan = planSeats(inputOf(STAGES[1]!, 6, true));
    expect(plan.seats.some((s) => s.role === 'master')).toBe(false);
    expect(plan.center.y).toBe(EDGE_PAD);
  });

  it('左列从下往上、右列从上往下依行动顺序排列', () => {
    const plan = planSeats(inputOf(STAGES[3]!, 9));
    const left = plan.seats.filter((s) => s.role === 'left');
    const right = plan.seats.filter((s) => s.role === 'right');
    expect(left.map((s) => s.y)).toEqual([...left.map((s) => s.y)].sort((a, b) => b - a));
    expect(right.map((s) => s.y)).toEqual([...right.map((s) => s.y)].sort((a, b) => a - b));
    // 先排完左列再排右列
    expect(plan.seats.filter((s) => s.role !== 'master').map((s) => s.id)).toEqual(ids(7));
  });
});

describe('centerWidth', () => {
  it('按比例取，夹在最小与最大之间', () => {
    expect(centerWidth(1000, FOOTPRINT, 0)).toBe(360);
    expect(centerWidth(600, FOOTPRINT, 0)).toBe(340);
    expect(centerWidth(2400, FOOTPRINT, 0)).toBe(600);
  });

  it('不小于梦主牌宽度', () => {
    expect(centerWidth(1000, FOOTPRINT, PLATE_SIZES.full.master.w + 100)).toBe(
      PLATE_SIZES.full.master.w + 100,
    );
  });
});

describe('bubbleSpot', () => {
  const seat = (
    role: PlannedSeat['role'],
    x: number,
    over: Partial<PlannedSeat> = {},
  ): PlannedSeat => ({
    id: 'a',
    x,
    y: 300,
    w: 132,
    h: 224,
    role,
    ...over,
  });

  it('左列座位的气泡在座位牌右侧，右列的在左侧，都与座位牌留出间隙', () => {
    const l = bubbleSpot(seat('left', 100), 1280);
    expect(l.side).toBe('left');
    expect(l.x).toBe(100 + 66 + 8);
    const r = bubbleSpot(seat('right', 1180), 1280);
    expect(r.side).toBe('right');
    expect(r.x).toBe(1180 - 66 - 8);
  });

  it('气泡与座位牌顶部对齐（略低一点），不超出座位牌的上沿', () => {
    const spot = bubbleSpot(seat('left', 100), 1280);
    expect(spot.y).toBeGreaterThanOrEqual(300 - 112);
    expect(spot.y).toBeLessThan(300);
  });

  it('梦主优先放右侧；右侧放不下时放左侧', () => {
    expect(bubbleSpot(seat('master', 640, { w: 340, h: 136 }), 1280).side).toBe('left');
    expect(bubbleSpot(seat('master', 1100, { w: 340, h: 136 }), 1280).side).toBe('right');
  });

  it('同一列相邻两个座位的气泡不会叠在一起', () => {
    const a = bubbleSpot(seat('left', 100, { y: 150 }), 1280);
    const b = bubbleSpot(seat('left', 100, { y: 150 + 224 + 8 }), 1280);
    expect(b.y - a.y).toBeGreaterThan(40);
  });
});
