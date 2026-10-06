// 对局界面的视口形态（纯函数 + 查询串）
//
// 窄屏（<1024px）共用移动布局，内部按形态微调：
//   phone             手机竖屏：紧凑行动轴、层塔、可收起的一体式手牌坞
//   tablet            平板竖屏（≥768px 且高度充足）：行动轴加宽、层塔与手牌更大
//   compact-landscape 手机横屏（高度 ≤500px）：左右分栏，左层塔 + 行动轴，右手牌与操作
// 桌面布局（≥1024px）按视口放大系数缩放整个舞台，见 desktopScale。
// 查询串与 styles/index.css 里的自定义变体 tablet / short-land 保持逐字一致（viewportMode.test.ts 校验）。

export const COMPACT_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px)';
export const TABLET_QUERY = '(min-width: 768px) and (min-height: 501px)';

export type MobileMode = 'phone' | 'tablet' | 'compact-landscape';

/** 矮屏横屏优先于平板：高度不够时宽度再大也放不下竖向堆叠 */
export function resolveMobileMode(flags: {
  readonly compactLandscape: boolean;
  readonly tablet: boolean;
}): MobileMode {
  if (flags.compactLandscape) return 'compact-landscape';
  return flags.tablet ? 'tablet' : 'phone';
}

/** 桌面舞台放大系数的参照尺寸：在这个尺寸的视口里界面按 1:1 排布 */
export const DESKTOP_BASE_WIDTH = 1280;
export const DESKTOP_BASE_HEIGHT = 800;
/** 放大系数低于这个值时不放大（1440×900 这类视口保持 1:1），也不超过上限 */
export const DESKTOP_SCALE_THRESHOLD = 1.15;
export const DESKTOP_SCALE_MAX = 2;

/**
 * 桌面布局的放大系数：视口比参照尺寸大得多时（1920×1080、2560×1440 等）把整个舞台按比例放大，
 * 让卡牌、座位牌与文字保持可读；舞台内部仍按「视口 / 系数」的虚拟尺寸排布。
 * 取宽高两个方向里较小的比例，保证放大后虚拟视口不小于参照尺寸。
 */
export function desktopScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const raw = Math.min(width / DESKTOP_BASE_WIDTH, height / DESKTOP_BASE_HEIGHT);
  if (raw < DESKTOP_SCALE_THRESHOLD) return 1;
  return Math.min(DESKTOP_SCALE_MAX, Math.floor(raw * 100) / 100);
}
