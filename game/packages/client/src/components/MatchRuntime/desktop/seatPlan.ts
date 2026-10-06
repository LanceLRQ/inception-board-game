// 桌面舞台的座位规划（纯函数）：梦主在上居中，盗梦者分列两侧，中央留给皮肤的中央舞台
//
// 本人不占座位环，由底部坞承载。座位牌有三档尺寸，按舞台实际大小与人数取放得下的最大一档，
// 保证 4–10 人、1024×768 以上的视口里座位不重叠、不出界、不压到中央舞台。
// 两侧的座位沿椭圆弧略微外凸，从左下沿弧线往上、过梦主、再向下，与行动顺序（顺时针）一致。

import type { CenterFootprint } from '../../../theme/skins/types';

export type SeatDensity = 'grand' | 'full' | 'mid' | 'compact';

export interface PlateSize {
  readonly w: number;
  readonly h: number;
}

/** 各档座位牌的尺寸（像素）：盗梦者牌竖排，梦主牌横排更宽 */
export const PLATE_SIZES: Readonly<
  Record<SeatDensity, { readonly thief: PlateSize; readonly master: PlateSize }>
> = {
  grand: { thief: { w: 164, h: 278 }, master: { w: 420, h: 176 } },
  full: { thief: { w: 132, h: 224 }, master: { w: 340, h: 136 } },
  mid: { thief: { w: 104, h: 164 }, master: { w: 272, h: 104 } },
  compact: { thief: { w: 176, h: 70 }, master: { w: 236, h: 70 } },
};

const DENSITY_ORDER: readonly SeatDensity[] = ['grand', 'full', 'mid', 'compact'];

/** 舞台边缘留白 / 座位牌之间的最小间隙 / 梦主与中央舞台之间的间隙 */
export const EDGE_PAD = 12;
const GAP = 8;
const CENTER_GAP = 8;
/** 提示栈（响应窗口等）的宽度：右上角的提示不压住座位 */
export const NOTICE_WIDTH = 264;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PlannedSeat {
  readonly id: string;
  /** 座位牌中心在舞台里的坐标（像素） */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly role: 'master' | 'left' | 'right';
}

export interface SeatPlan {
  readonly density: SeatDensity;
  readonly seats: readonly PlannedSeat[];
  /** 中央舞台的区域 */
  readonly center: Rect;
}

export interface PlanInput {
  readonly stage: { readonly w: number; readonly h: number };
  /** 环上的盗梦者（不含本人、不含梦主），按行动顺序 */
  readonly thieves: readonly string[];
  /** 梦主座位；本人就是梦主时为 null（梦主由坞承载） */
  readonly masterId: string | null;
  readonly footprint: CenterFootprint;
  /** 右上角提示栈占用的高度；没有提示为 0 */
  readonly reserveRight: number;
}

/** 中央舞台的宽度：按比例取，不小于梦主牌宽度 */
export function centerWidth(stageW: number, fp: CenterFootprint, masterW: number): number {
  const wanted = Math.min(fp.maxWidth, Math.max(fp.minWidth, stageW * fp.widthRatio));
  return Math.max(wanted, masterW);
}

interface Candidate {
  readonly density: SeatDensity;
  readonly fits: boolean;
  readonly plan: SeatPlan;
}

function evaluate(input: PlanInput, density: SeatDensity): Candidate {
  const { stage, thieves, masterId, footprint, reserveRight } = input;
  const sizes = PLATE_SIZES[density];
  const nLeft = Math.ceil(thieves.length / 2);
  const nRight = thieves.length - nLeft;
  const masterH = masterId ? sizes.master.h : 0;
  const masterW = masterId ? sizes.master.w : 0;

  const cw = centerWidth(stage.w, footprint, masterW);
  const centerX = (stage.w - cw) / 2;
  const centerY = EDGE_PAD + (masterId ? masterH + CENTER_GAP : 0);
  const center: Rect = {
    x: centerX,
    y: centerY,
    w: cw,
    h: Math.max(0, stage.h - EDGE_PAD - centerY),
  };

  // 两侧座位列：左列从下往上，右列从上往下，各自在可用高度里均分
  const colTop = (reserve: number) => EDGE_PAD + reserve;
  const colHeight = (reserve: number) => stage.h - EDGE_PAD - colTop(reserve);
  const sideRoom = centerX - CENTER_GAP - EDGE_PAD; // 一侧能放座位牌的宽度（含外凸）
  const bow = Math.max(0, Math.min(stage.w * 0.04, sideRoom - sizes.thief.w));

  const seats: PlannedSeat[] = [];
  if (masterId) {
    seats.push({
      id: masterId,
      x: stage.w / 2,
      y: EDGE_PAD + masterH / 2,
      w: sizes.master.w,
      h: masterH,
      role: 'master',
    });
  }
  const place = (ids: readonly string[], side: 'left' | 'right', reserve: number) => {
    const k = ids.length;
    if (k === 0) return;
    const top = colTop(reserve);
    const slot = colHeight(reserve) / k;
    ids.forEach((id, i) => {
      // 左列 i 从下往上数，右列 i 从上往下数
      const row = side === 'left' ? k - 1 - i : i;
      const y = top + (row + 0.5) * slot;
      const t = (y - top) / (slot * k);
      const inset = bow * (1 - Math.sin(Math.PI * t));
      const half = sizes.thief.w / 2;
      const x = side === 'left' ? EDGE_PAD + half + inset : stage.w - EDGE_PAD - half - inset;
      seats.push({ id, x, y, w: sizes.thief.w, h: sizes.thief.h, role: side });
    });
  };
  place(thieves.slice(0, nLeft), 'left', 0);
  place(thieves.slice(nLeft), 'right', reserveRight);

  const columnFits = (k: number, reserve: number) =>
    k === 0 || k * sizes.thief.h + (k - 1) * GAP <= colHeight(reserve);
  const fits =
    columnFits(nLeft, 0) &&
    columnFits(nRight, reserveRight) &&
    sizes.thief.w <= sideRoom &&
    center.h >= footprint.minHeight;
  return { density, fits, plan: { density, seats, center } };
}

/** 取放得下的最大一档；都放不下就用最紧凑的一档 */
export function planSeats(input: PlanInput): SeatPlan {
  let last: Candidate | null = null;
  for (const density of DENSITY_ORDER) {
    const c = evaluate(input, density);
    if (c.fits) return c.plan;
    last = c;
  }
  return last!.plan;
}

/** 座位牌的包围盒是否相交（含间隙为 0 的贴边不算相交） */
export function seatsOverlap(a: PlannedSeat, b: PlannedSeat): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.5 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 0.5;
}

/** 座位旁气泡与座位牌的间距 / 气泡至少要有的宽度（放不下就换到另一侧） */
const BUBBLE_GAP = 8;
const BUBBLE_MIN_ROOM = 150;

export interface BubbleSpot {
  /** 气泡尖角的方向：left = 气泡在座位牌右侧、尖角朝左；right = 气泡在座位牌左侧、尖角朝右 */
  readonly side: 'left' | 'right';
  /** 气泡定位点：side 为 left 时是气泡左上角，side 为 right 时是气泡右上角（舞台坐标，像素） */
  readonly x: number;
  readonly y: number;
}

/**
 * 座位气泡放在座位牌朝向舞台中央的一侧：左列的座位气泡在右边，右列的在左边，
 * 同一列上下相邻的座位气泡不会叠在一起；梦主在上居中，优先放右侧，右侧放不下才放左侧。
 */
export function bubbleSpot(seat: PlannedSeat, stageW: number): BubbleSpot {
  const y = seat.y - seat.h / 2 + (seat.h <= 80 ? 6 : 10);
  const rightX = seat.x + seat.w / 2 + BUBBLE_GAP;
  const leftX = seat.x - seat.w / 2 - BUBBLE_GAP;
  const preferRight =
    seat.role === 'left' || (seat.role === 'master' && stageW - rightX >= BUBBLE_MIN_ROOM);
  if (preferRight && stageW - rightX >= BUBBLE_MIN_ROOM) return { side: 'left', x: rightX, y };
  return { side: 'right', x: leftX, y };
}
