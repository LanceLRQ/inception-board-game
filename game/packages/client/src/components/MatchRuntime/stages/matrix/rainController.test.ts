import { describe, expect, it } from 'vitest';
import { RAIN_PROFILES } from './rain';
import {
  createRainController,
  type RainChange,
  type RainContext2D,
  type RainDisplayState,
  type RainEnv,
} from './rainController';

const profile = RAIN_PROFILES.desktop;

function makeHarness(opts: { width?: number; height?: number; dpr?: number } = {}) {
  const calls = { fillText: 0, clearRect: 0, fillRect: 0, setTransform: [] as number[][] };
  const ctx: RainContext2D = {
    font: '',
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    setTransform: (...a) => calls.setTransform.push(a),
    clearRect: () => calls.clearRect++,
    fillRect: () => calls.fillRect++,
    fillText: () => calls.fillText++,
  };
  const states: RainDisplayState[] = [];
  const canvas = { width: 0, height: 0 };
  const attrs: Record<string, string | null> = { 'data-fx-off': null, 'data-motion': null };
  const flags = { hidden: false, reduced: false, dpr: opts.dpr ?? 1 };
  const size = { width: opts.width ?? 800, height: opts.height ?? 600 };
  let listener: ((c: RainChange) => void) | null = null;
  let unlistened = 0;
  let nextId = 1;
  let pending: { id: number; cb: (t: number) => void } | null = null;
  let canceled = 0;
  const env: RainEnv = {
    requestFrame: (cb) => {
      pending = { id: nextId++, cb };
      return pending.id;
    },
    cancelFrame: (id) => {
      canceled++;
      if (pending?.id === id) pending = null;
    },
    devicePixelRatio: () => flags.dpr,
    isHidden: () => flags.hidden,
    prefersReducedMotion: () => flags.reduced,
    rootAttribute: (name) => attrs[name] ?? null,
    size: () => size,
    style: () => ({ body: 'b', head: 'h', fade: 'f', fontFamily: 'monospace' }),
    listen: (cb) => {
      listener = cb;
      return () => {
        unlistened++;
        listener = null;
      };
    },
  };
  const controller = createRainController({
    canvas,
    onDisplayState: (s) => states.push(s),
    ctx,
    env,
    profile,
    seed: 42,
  });
  /** 按 60Hz 推进 ms 毫秒的帧回调 */
  let clock = 0;
  const runFrames = (ms: number): void => {
    const end = clock + ms;
    while (clock < end) {
      clock += 1000 / 60;
      const p = pending;
      pending = null;
      p?.cb(clock);
    }
  };
  return {
    calls,
    ctx,
    canvas,
    states,
    attrs,
    flags,
    size,
    controller,
    runFrames,
    emit: (c: RainChange) => listener?.(c),
    hasPending: () => pending !== null,
    canceled: () => canceled,
    unlistened: () => unlistened,
    hasListener: () => listener !== null,
  };
}

/** 开始计一段时间内画出的雨帧数（每帧恰好一次擦除用的 fillRect） */
function framesOver(h: ReturnType<typeof makeHarness>, ms: number): number {
  const before = h.calls.fillRect;
  h.runFrames(ms);
  return h.calls.fillRect - before;
}

describe('数字雨控制器', () => {
  it('启动后进入 running，预热出尾迹，并排下一帧', () => {
    const h = makeHarness();
    h.controller.start();
    expect(h.states).toEqual(['running']);
    expect(h.calls.fillRect).toBe(profile.warmupFrames);
    expect(h.calls.fillText).toBeGreaterThan(0);
    expect(h.hasPending()).toBe(true);
  });

  it('限帧：1 秒内画出的帧数不超过目标帧率', () => {
    const h = makeHarness();
    h.controller.start();
    const frames = framesOver(h, 1000);
    expect(frames).toBeGreaterThan(profile.fps - 4);
    expect(frames).toBeLessThanOrEqual(profile.fps + 1);
  });

  it('画布尺寸 = 容器尺寸 × 设备像素比，比值上限为 2', () => {
    const h = makeHarness({ width: 640, height: 400, dpr: 3 });
    h.controller.start();
    expect(h.canvas.width).toBe(1280);
    expect(h.canvas.height).toBe(800);
    expect(h.calls.setTransform.at(-1)).toEqual([2, 0, 0, 2, 0, 0]);

    const h1 = makeHarness({ width: 640, height: 400, dpr: 1 });
    h1.controller.start();
    expect(h1.canvas.width).toBe(640);
  });

  it('舞台很大时按像素总数上限压低倍率：画布像素数不超过上限', () => {
    const h = makeHarness({ width: 1920, height: 1080, dpr: 2 });
    h.controller.start();
    expect(h.canvas.width / 1920).toBeLessThan(2);
    expect(h.canvas.width * h.canvas.height).toBeLessThanOrEqual(2_400_000 * 1.01);
  });

  it('容器尺寸变化时重建画布，并继续按新尺寸运行', () => {
    const h = makeHarness({ width: 640, height: 400, dpr: 1 });
    h.controller.start();
    h.size.width = 900;
    h.size.height = 500;
    h.emit('resize');
    expect(h.canvas.width).toBe(900);
    expect(h.canvas.height).toBe(500);
    expect(h.states.at(-1)).toBe('running');
    expect(h.hasPending()).toBe(true);
  });

  it('容器没有尺寸时不画，也不排帧', () => {
    const h = makeHarness({ width: 0, height: 0 });
    h.controller.start();
    expect(h.calls.fillText).toBe(0);
    expect(h.hasPending()).toBe(false);
  });

  it('页面不可见时暂停（不再排帧），重新可见时恢复', () => {
    const h = makeHarness();
    h.controller.start();
    h.flags.hidden = true;
    h.emit('visibility');
    expect(h.states.at(-1)).toBe('paused');
    expect(h.hasPending()).toBe(false);
    const drawn = h.calls.fillText;
    h.runFrames(500);
    expect(h.calls.fillText).toBe(drawn);

    h.flags.hidden = false;
    h.emit('visibility');
    expect(h.states.at(-1)).toBe('running');
    expect(h.hasPending()).toBe(true);
    expect(framesOver(h, 500)).toBeGreaterThan(0);
  });

  it('data-fx-off 含 rain 时停掉动画并清空画布；去掉后重新启动', () => {
    const h = makeHarness();
    h.controller.start();
    h.attrs['data-fx-off'] = 'scan rain';
    h.emit('attributes');
    expect(h.states.at(-1)).toBe('off');
    expect(h.hasPending()).toBe(false);
    expect(h.calls.clearRect).toBeGreaterThan(0);
    const drawn = h.calls.fillText;
    h.runFrames(600);
    expect(h.calls.fillText).toBe(drawn);

    h.attrs['data-fx-off'] = null;
    h.emit('attributes');
    expect(h.states.at(-1)).toBe('running');
    expect(framesOver(h, 500)).toBeGreaterThan(0);
  });

  it('一开始就关着 rain：不画、不排帧', () => {
    const h = makeHarness();
    h.attrs['data-fx-off'] = 'rain';
    h.controller.start();
    expect(h.states).toEqual(['off']);
    expect(h.calls.fillText).toBe(0);
    expect(h.hasPending()).toBe(false);
  });

  it('系统减少动效：只画静态一帧，不排帧；偏好变化时即时响应', () => {
    const h = makeHarness();
    h.flags.reduced = true;
    h.controller.start();
    expect(h.states).toEqual(['static']);
    expect(h.calls.fillText).toBeGreaterThan(0);
    expect(h.hasPending()).toBe(false);

    h.flags.reduced = false;
    h.emit('motion');
    expect(h.states.at(-1)).toBe('running');
    expect(h.hasPending()).toBe(true);

    h.flags.reduced = true;
    h.emit('motion');
    expect(h.states.at(-1)).toBe('static');
    expect(h.hasPending()).toBe(false);
  });

  it('data-motion=reduced 与系统偏好同效，且在运行中变化也会响应', () => {
    const h = makeHarness();
    h.controller.start();
    h.attrs['data-motion'] = 'reduced';
    h.emit('attributes');
    expect(h.states.at(-1)).toBe('static');
    expect(h.hasPending()).toBe(false);
  });

  it('静态模式下页面不可见也保持 static，不会误报 paused', () => {
    const h = makeHarness();
    h.flags.reduced = true;
    h.flags.hidden = true;
    h.controller.start();
    expect(h.states).toEqual(['static']);
  });

  it('同一状态不重复通知', () => {
    const h = makeHarness();
    h.controller.start();
    h.emit('attributes');
    h.emit('attributes');
    expect(h.states).toEqual(['running']);
  });

  it('销毁时取消帧回调、取消订阅，之后再触发变化也不再画', () => {
    const h = makeHarness();
    h.controller.start();
    h.controller.dispose();
    expect(h.hasPending()).toBe(false);
    expect(h.unlistened()).toBe(1);
    expect(h.hasListener()).toBe(false);
    const drawn = h.calls.fillText;
    h.emit('attributes');
    h.runFrames(500);
    expect(h.calls.fillText).toBe(drawn);
    h.controller.dispose();
    expect(h.unlistened()).toBe(1);
  });

  it('销毁后不能再启动', () => {
    const h = makeHarness();
    h.controller.dispose();
    h.controller.start();
    expect(h.states).toEqual([]);
    expect(h.hasListener()).toBe(false);
  });
});
