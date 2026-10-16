// 动画的起止点：按界面上已有的稳定 data-testid 找元素的位置，两个布局都适用
// 找不到（被收起、不在当前布局里）就退到视口中央，动画照样播、只是起止点不精确。

export interface FxRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const testid = (id: string): string => `[data-testid="${id}"]`;

/** 本人的牌在手牌坞，别人的在座位牌（桌面）或行动轴（移动） */
export function seatSelectors(player: string, viewer: string | null): string[] {
  return player === viewer
    ? [testid('hand-dock')]
    : [testid(`player-seat-${player}`), testid(`rail-slot-${player}`)];
}

export const DECK_SELECTORS = [testid('deck-meter')];
export const DISCARD_SELECTORS = [testid('pile-discard'), testid('deck-meter')];
export const PLAYED_SELECTORS = [testid('pile-played'), testid('pile-discard')];

/** 某一层：桌面的层卡片、移动的层塔行 */
export function layerSelectors(layer: number): string[] {
  return [
    `${testid('center-stage')} ${testid(`layer-row-${layer}`)}`,
    testid(`layer-row-${layer}`),
  ];
}

/** 视口中央的一个点 */
export function viewportCenter(): FxRect {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 0, h: 0 };
}

/** 依次试每个选择器，取第一个看得见的元素的位置；都没有就退到视口中央 */
export function locate(selectors: readonly string[], root: ParentNode = document): FxRect {
  for (const sel of selectors) {
    for (const el of root.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
  }
  return viewportCenter();
}

/** 矩形的中心点 */
export function centerOf(r: FxRect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export const STAGE_SELECTORS = [testid('runtime-stage')];

/** 说明条与舞台区下沿的距离（移动布局，像素） */
const CAPTION_INSET = 8;

/**
 * 说明条的位置：贴着舞台区下沿、水平居中，避开顶部的座位、回合信息与层级标签。
 * 桌面骑在舞台与底部坞的分界线上（那里只有牌堆一行的下边距和手牌的上边距）；
 * 移动在舞台区内侧、紧挨手牌坞。返回说明条的锚点与纵向的对齐比例（0 顶、0.5 中、1 底）。
 */
export function captionPlace(
  stage: FxRect,
  straddle: boolean,
): { x: number; y: number; alignY: 0.5 | 1 } {
  const x = stage.x + stage.w / 2;
  const bottom = stage.y + stage.h;
  return straddle ? { x, y: bottom, alignY: 0.5 } : { x, y: bottom - CAPTION_INSET, alignY: 1 };
}
