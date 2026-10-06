// 数字雨控制器：不依赖 DOM 的状态机，运行环境（时钟、帧回调、监听、颜色）由 RainEnv 注入
//
// 职责：按运行模式决定「持续动画 / 静态一帧 / 不画」，限帧，页面不可见时暂停，
// 尺寸变化时重建画布，销毁时清理所有监听与帧回调。真实环境的绑定见 rainDom.ts。

import {
  createRainState,
  frameIntervalMs,
  mulberry32,
  parseFxOff,
  pickGlyph,
  renderScale,
  resolveRainMode,
  shouldRenderFrame,
  stepRain,
  type RainProfile,
  type RainState,
} from './rain';

/** 画布 2D 上下文用到的那一小部分，便于替身测试 */
export interface RainContext2D {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  globalCompositeOperation: string;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

/** 画布的当前状态，写到画布的 data-rain-state 上，供样式与测试观察 */
export type RainDisplayState = 'running' | 'paused' | 'static' | 'off';

/** 画布的像素尺寸（HTMLCanvasElement 满足这个形状） */
export interface RainCanvasSize {
  width: number;
  height: number;
}

/** 从主题令牌读到的绘制风格 */
export interface RainStyle {
  readonly body: string;
  readonly head: string;
  /** 擦除用的填充色：只有透明度起作用 */
  readonly fade: string;
  readonly fontFamily: string;
}

export type RainChange = 'visibility' | 'motion' | 'attributes' | 'resize';

export interface RainEnv {
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(id: number): void;
  devicePixelRatio(): number;
  isHidden(): boolean;
  prefersReducedMotion(): boolean;
  rootAttribute(name: string): string | null;
  /** 容器的 CSS 像素尺寸 */
  size(): { readonly width: number; readonly height: number };
  style(): RainStyle;
  /** 订阅页面可见性、减少动效偏好、根元素属性与容器尺寸的变化；返回取消订阅 */
  listen(onChange: (change: RainChange) => void): () => void;
}

export interface RainControllerDeps {
  readonly canvas: RainCanvasSize;
  /** 画布状态变化时通知（只在变化时调用） */
  readonly onDisplayState: (state: RainDisplayState) => void;
  readonly ctx: RainContext2D;
  readonly env: RainEnv;
  readonly profile: RainProfile;
  readonly seed?: number;
}

export interface RainController {
  start(): void;
  dispose(): void;
}

export function createRainController(deps: RainControllerDeps): RainController {
  const { canvas, ctx, env, profile } = deps;
  const rng = mulberry32(deps.seed ?? 0x6d747278);
  const interval = frameIntervalMs(profile.fps);

  let state: RainState | null = null;
  let width = 0;
  let height = 0;
  let style: RainStyle | null = null;
  /** 画布上是否已有内容：切换模式时据此决定要不要预热重画 */
  let painted = false;
  let frameId: number | null = null;
  let lastTick = Number.NEGATIVE_INFINITY;
  let shown: RainDisplayState | null = null;
  let unlisten: (() => void) | null = null;
  let disposed = false;

  function show(next: RainDisplayState): void {
    if (shown === next) return;
    shown = next;
    deps.onDisplayState(next);
  }

  function cancel(): void {
    if (frameId !== null) env.cancelFrame(frameId);
    frameId = null;
  }

  function clear(): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    painted = false;
  }

  /** 按容器尺寸重建画布与雨滴；尺寸无效时没有状态可画 */
  function build(): void {
    const size = env.size();
    width = Math.max(0, Math.round(size.width));
    height = Math.max(0, Math.round(size.height));
    style = env.style();
    painted = false;
    if (width === 0 || height === 0) {
      state = null;
      return;
    }
    const dpr = renderScale(width, height, env.devicePixelRatio());
    // 改画布尺寸会重置上下文状态，所以变换与字体要在它之后设
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${profile.fontSize}px ${style.fontFamily}`;
    state = createRainState(width, height, profile, rng);
  }

  function drawFrame(): void {
    if (!state || !style) return;
    // 旧像素按比例擦掉一点，形成尾迹
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = profile.fade;
    ctx.fillStyle = style.fade;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    for (let c = 0; c < state.columns; c++) {
      if (!state.active[c]) continue;
      const head = rng() < profile.headChance;
      ctx.fillStyle = head ? style.head : style.body;
      ctx.globalAlpha = head ? profile.headAlpha : profile.bodyAlpha;
      ctx.fillText(pickGlyph(rng), c * profile.columnWidth, state.drops[c]!);
    }
    ctx.globalAlpha = 1;
  }

  function advance(): void {
    if (!state) return;
    stepRain(state, height, profile, rng);
    drawFrame();
  }

  /** 预先推进若干帧，让第一眼就有尾迹 */
  function warmUp(): void {
    for (let i = 0; i < profile.warmupFrames; i++) advance();
    painted = true;
  }

  function loop(time: number): void {
    frameId = null;
    if (disposed) return;
    if (shouldRenderFrame(time, lastTick, interval)) {
      lastTick = time;
      advance();
    }
    frameId = env.requestFrame(loop);
  }

  function sync(): void {
    if (disposed) return;
    const mode = resolveRainMode({
      fxOff: parseFxOff(env.rootAttribute('data-fx-off')),
      reducedMotion: env.prefersReducedMotion(),
      motionAttr: env.rootAttribute('data-motion'),
    });
    if (mode === 'off') {
      cancel();
      if (state) clear();
      show('off');
      return;
    }
    if (!state) build();
    if (!state) {
      cancel();
      show(mode === 'static' ? 'static' : 'paused');
      return;
    }
    if (!painted) warmUp();
    if (mode === 'static') {
      cancel();
      show('static');
      return;
    }
    if (env.isHidden()) {
      cancel();
      show('paused');
      return;
    }
    show('running');
    if (frameId === null) {
      lastTick = Number.NEGATIVE_INFINITY;
      frameId = env.requestFrame(loop);
    }
  }

  return {
    start() {
      if (disposed || unlisten) return;
      unlisten = env.listen((change) => {
        if (change === 'resize') {
          state = null;
        }
        sync();
      });
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      unlisten?.();
      unlisten = null;
    },
  };
}
