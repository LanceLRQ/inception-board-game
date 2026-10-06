// 「筑梦蓝图」的制图计算：楼板（梦境层）的轴测外形与牌库刻度，纯函数、与界面无关
//
// 每一层画成一块斜切的楼板：顶面是平行四边形（顶边相对底边右移 SLAB_SKEW），
// 普通层与焦点层再带一个板厚（前面 + 右侧面）；迷失层是图面之外的虚线基础，没有板厚。
// 外形在固定的视窗坐标系里给出，组件用 preserveAspectRatio="none" 拉伸到行的实际尺寸，
// 描边用 non-scaling-stroke，线宽不随拉伸变化。

export const SLAB_KINDS = ['regular', 'focus', 'lost'] as const;
export type SlabKind = (typeof SLAB_KINDS)[number];

export const SLAB_WIDTH = 470;
/** 顶边相对底边向右的偏移 */
export const SLAB_SKEW = 44;
/** 板厚 */
export const SLAB_THICKNESS = 6;
/** 给描边留的余量，避免线条被视窗裁掉一半 */
const MARGIN = 2;

/** 顶面的高度（不含板厚） */
const FACE_HEIGHT: Readonly<Record<SlabKind, number>> = {
  regular: 52,
  focus: 100,
  lost: 36,
};

/**
 * 楼板内容左右各内缩的百分比（相对楼板宽度）：倾斜量加一份描边余量。
 * 斜切的楼板左边在顶部最靠右（偏移整个倾斜量）、右边在底部最靠左（同样收进整个倾斜量），
 * 所以无论内容在板面的哪一段（单行居中、两行、换行后占满板面），只要左右各内缩这么多，
 * 内容的四个角就都在顶面平行四边形之内；不依赖行高与内容高度，窗口怎么缩放都成立。
 */
export const SLAB_CONTENT_INSET = Math.round(((SLAB_SKEW + MARGIN) / SLAB_WIDTH) * 100 * 10) / 10;

export interface SlabGeometry {
  /** SVG 视窗 */
  readonly viewBox: string;
  /** 顶面（平行四边形）：左上、右上、右下、左下 */
  readonly top: string;
  /** 前面（顶面下边向下拉出的一条）；没有板厚为 null */
  readonly front: string | null;
  /** 右侧面；没有板厚为 null */
  readonly side: string | null;
}

const pts = (...p: ReadonlyArray<readonly [number, number]>): string =>
  p.map(([x, y]) => `${x},${y}`).join(' ');

export function slabGeometry(kind: SlabKind): SlabGeometry {
  const h = FACE_HEIGHT[kind];
  const left = MARGIN;
  const right = SLAB_WIDTH - MARGIN;
  const topY = MARGIN;
  const botY = MARGIN + h;
  // 底边在左，顶边整体右移 SLAB_SKEW；底边右端 = 顶边右端 - SLAB_SKEW
  const botRight = right - SLAB_SKEW;
  const topLeft = left + SLAB_SKEW;
  const top = pts([topLeft, topY], [right, topY], [botRight, botY], [left, botY]);

  if (kind === 'lost') {
    return { viewBox: `0 0 ${SLAB_WIDTH} ${botY + MARGIN}`, top, front: null, side: null };
  }
  const depthY = botY + SLAB_THICKNESS;
  return {
    viewBox: `0 0 ${SLAB_WIDTH} ${depthY + MARGIN}`,
    top,
    front: pts([left, botY], [botRight, botY], [botRight, depthY], [left, depthY]),
    side: pts([right, topY], [botRight, botY], [botRight, depthY], [right, topY + SLAB_THICKNESS]),
  };
}

/** 一层用哪种楼板：焦点层最高（要多放一行占位者），其余迷失层是虚线基础、普通层是薄板 */
export function slabKindOf(layer: number, focusLayer: number): SlabKind {
  if (layer === focusLayer) return 'focus';
  return layer === 0 ? 'lost' : 'regular';
}

/** 牌库剩余的百分比（取整，夹在 0–100）；总数无效时为 0 */
export function deckPercent(remaining: number, total: number): number {
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((remaining / total) * 100)));
}
