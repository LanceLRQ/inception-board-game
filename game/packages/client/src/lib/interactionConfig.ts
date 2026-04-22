// 卡牌交互统一配置
// 对照：plans/design/06c-match-table-layout.md §6.1
//
// 设计取舍：长按阈值从 500 调到 2000，主要解决 PC 端鼠标按下意外触发详情弹窗的问题；
// PC 双击作为快捷等价手势，两端统一走 useCardPressDetail hook。

/** 长按阈值（毫秒）：PC + 移动端统一 2000ms */
export const LONG_PRESS_MS = 2000;

/** 双击最大间隔（毫秒）：PC 专用 */
export const DOUBLE_CLICK_MS = 250;

/** 长按期间允许的指针移动像素（超过则取消长按，防误触） */
export const LONG_PRESS_MOVE_TOLERANCE = 10;
