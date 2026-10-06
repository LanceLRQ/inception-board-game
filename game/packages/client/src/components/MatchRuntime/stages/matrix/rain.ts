// 「梦境矩阵」的数字雨：纯计算部分，与 DOM、画布无关，便于单测
//
// 一列一滴雨：每帧按「步长 × 列速度」往下落，落出画面后按小概率回到顶部。
// 画布的建立、限帧与监听在 rainController.ts，颜色由控制器从主题令牌读取，这里不涉及颜色。

/** 字符集：二进制数字、半角片假名与几个代码符号 */
export const RAIN_GLYPHS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ<>/\\|=+*';

/** 设备像素比的上限：再高的屏幕也按 2 倍绘制，省下的是填充率 */
export const MAX_DPR = 2;

export interface RainProfile {
  /** 字号（像素） */
  readonly fontSize: number;
  /** 列宽（像素） */
  readonly columnWidth: number;
  /** 每一帧下落的基础步长（像素），乘以各列的速度系数 */
  readonly stepPx: number;
  /** 目标帧率；实际由 requestAnimationFrame 的节拍取整，只会低于或等于它 */
  readonly fps: number;
  /** 参与下雨的列占比 0–1 */
  readonly activeRatio: number;
  /** 每帧对旧像素的擦除强度 0–1，越大尾迹越短 */
  readonly fade: number;
  /** 普通字符与亮头字符的不透明度 */
  readonly bodyAlpha: number;
  readonly headAlpha: number;
  /** 一个字符是亮头的概率 */
  readonly headChance: number;
  /** 首次绘制前预先推进的帧数，让静态画面和刚启动时就有尾迹 */
  readonly warmupFrames: number;
}

/** 两档：桌面铺满舞台，移动端更稀更暗，不抢操作区 */
export const RAIN_PROFILES = {
  desktop: {
    fontSize: 13,
    columnWidth: 16,
    stepPx: 9,
    fps: 20,
    activeRatio: 0.85,
    fade: 0.12,
    bodyAlpha: 0.2,
    headAlpha: 0.38,
    headChance: 0.06,
    warmupFrames: 26,
  },
  mobile: {
    fontSize: 12,
    columnWidth: 26,
    stepPx: 8,
    fps: 15,
    activeRatio: 0.5,
    fade: 0.14,
    bodyAlpha: 0.13,
    headAlpha: 0.26,
    headChance: 0.05,
    warmupFrames: 20,
  },
} as const satisfies Record<string, RainProfile>;

export type RainVariant = keyof typeof RAIN_PROFILES;

/** 带种子的随机数（mulberry32），输出落在 [0, 1) */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickGlyph(rng: () => number): string {
  return RAIN_GLYPHS.charAt(Math.floor(rng() * RAIN_GLYPHS.length) % RAIN_GLYPHS.length);
}

export function columnCount(width: number, columnWidth: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(columnWidth) || width <= 0 || columnWidth <= 0) {
    return 0;
  }
  return Math.floor(width / columnWidth);
}

/** 设备像素比夹在 [1, MAX_DPR]；无效值按 1 */
export function clampDpr(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr < 1) return 1;
  return Math.min(MAX_DPR, dpr);
}

/** 画布像素总数的上限：舞台很大时降低渲染倍率，每帧的擦除与合成开销随像素数线性增长 */
export const MAX_CANVAS_PIXELS = 2_400_000;

/** 渲染倍率：设备像素比（上限 2）再按像素总数上限压低，但不低于 1 */
export function renderScale(width: number, height: number, dpr: number): number {
  const capped = clampDpr(dpr);
  if (!(width > 0) || !(height > 0)) return capped;
  const limit = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
  return Math.max(1, Math.min(capped, limit));
}

export function frameIntervalMs(fps: number): number {
  return Number.isFinite(fps) && fps > 0 ? 1000 / fps : 50;
}

/** 限帧：距上一帧不到间隔就跳过；容忍 2ms 的节拍抖动 */
export function shouldRenderFrame(now: number, last: number, intervalMs: number): boolean {
  return now - last >= intervalMs - 2;
}

export interface RainState {
  readonly columns: number;
  /** 每列当前的下落位置（像素，字符基线） */
  readonly drops: Float32Array;
  /** 每列的速度系数 0.6–1.4 */
  readonly speeds: Float32Array;
  /** 该列是否参与下雨 */
  readonly active: Uint8Array;
}

export function createRainState(
  width: number,
  height: number,
  profile: RainProfile,
  rng: () => number,
): RainState {
  const columns = columnCount(width, profile.columnWidth);
  const drops = new Float32Array(columns);
  const speeds = new Float32Array(columns);
  const active = new Uint8Array(columns);
  for (let c = 0; c < columns; c++) {
    drops[c] = rng() * Math.max(0, height);
    speeds[c] = 0.6 + rng() * 0.8;
    active[c] = rng() < profile.activeRatio ? 1 : 0;
  }
  return { columns, drops, speeds, active };
}

/** 推进一帧（就地修改）：落出画面的雨滴每帧有 2.5% 的概率回到顶部 */
export function stepRain(
  state: RainState,
  height: number,
  profile: RainProfile,
  rng: () => number,
): void {
  for (let c = 0; c < state.columns; c++) {
    const y = state.drops[c]!;
    state.drops[c] = y > height && rng() > 0.975 ? 0 : y + profile.stepPx * state.speeds[c]!;
  }
}

/** 数字雨的运行模式：running 持续动画；static 只画静态一帧；off 不画 */
export type RainMode = 'running' | 'static' | 'off';

export function parseFxOff(attr: string | null | undefined): ReadonlySet<string> {
  return new Set((attr ?? '').split(/\s+/).filter(Boolean));
}

export interface RainModeInput {
  readonly fxOff: ReadonlySet<string>;
  /** 系统的「减少动效」偏好 */
  readonly reducedMotion: boolean;
  /** 根元素的 data-motion 属性 */
  readonly motionAttr: string | null;
}

export function resolveRainMode(input: RainModeInput): RainMode {
  if (input.fxOff.has('rain')) return 'off';
  if (input.reducedMotion || input.motionAttr === 'reduced') return 'static';
  return 'running';
}
