// 移动端手牌坞上下滑手势的判定（纯函数）

/** 拖动超过这个距离（像素）即视为展开 / 收起 */
export const SHEET_DRAG_DISTANCE = 36;
/** 快速轻扫的速度阈值（像素 / 毫秒）与最小位移 */
export const SHEET_FLICK_VELOCITY = 0.5;
export const SHEET_FLICK_MIN_DISTANCE = 12;

/**
 * 手牌坞拖动结束后的去向：收起态向上拖展开，展开态向下拖收起；
 * 距离不够但速度够快的轻扫同样生效；其余保持原状（返回 null）。
 * movementY 向下为正。
 */
export function sheetDragOutcome(input: {
  open: boolean;
  movementY: number;
  velocityY: number;
}): 'open' | 'close' | null {
  const { open, movementY, velocityY } = input;
  const fastEnough = velocityY >= SHEET_FLICK_VELOCITY;
  if (!open) {
    const up = -movementY;
    if (up >= SHEET_DRAG_DISTANCE || (fastEnough && up >= SHEET_FLICK_MIN_DISTANCE)) return 'open';
    return null;
  }
  if (movementY >= SHEET_DRAG_DISTANCE || (fastEnough && movementY >= SHEET_FLICK_MIN_DISTANCE)) {
    return 'close';
  }
  return null;
}
