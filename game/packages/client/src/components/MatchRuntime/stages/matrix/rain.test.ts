import { describe, expect, it } from 'vitest';
import {
  MAX_CANVAS_PIXELS,
  MAX_DPR,
  RAIN_GLYPHS,
  RAIN_PROFILES,
  clampDpr,
  columnCount,
  createRainState,
  frameIntervalMs,
  mulberry32,
  parseFxOff,
  pickGlyph,
  renderScale,
  resolveRainMode,
  shouldRenderFrame,
  stepRain,
} from './rain';

const desktop = RAIN_PROFILES.desktop;
const mobile = RAIN_PROFILES.mobile;

describe('数字雨 · 随机数', () => {
  it('同一个种子给出同一串数，不同种子不同', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const c = mulberry32(8);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect(seqA).not.toEqual([c(), c(), c()]);
  });

  it('输出落在 [0, 1)', () => {
    const r = mulberry32(123456);
    for (let i = 0; i < 2000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('数字雨 · 字符与度量', () => {
  it('字符集非空、没有空白字符，且含数字与片假名', () => {
    expect(RAIN_GLYPHS.length).toBeGreaterThan(20);
    expect(RAIN_GLYPHS).not.toMatch(/\s/);
    expect(RAIN_GLYPHS).toContain('0');
    expect(RAIN_GLYPHS).toMatch(/[゠-ヿ]/);
  });

  it('pickGlyph 总是取到字符集里的一个字符，随机数取端点也不越界', () => {
    for (const v of [0, 0.5, 0.999999]) {
      expect(RAIN_GLYPHS).toContain(pickGlyph(() => v));
    }
  });

  it('列数按列宽向下取整，无效尺寸为 0', () => {
    expect(columnCount(1280, 16)).toBe(80);
    expect(columnCount(1285, 16)).toBe(80);
    expect(columnCount(15, 16)).toBe(0);
    expect(columnCount(-5, 16)).toBe(0);
    expect(columnCount(Number.NaN, 16)).toBe(0);
    expect(columnCount(100, 0)).toBe(0);
  });

  it('设备像素比夹在 1 到 2 之间，无效值按 1', () => {
    expect(MAX_DPR).toBe(2);
    expect(clampDpr(1)).toBe(1);
    expect(clampDpr(1.5)).toBe(1.5);
    expect(clampDpr(3)).toBe(2);
    expect(clampDpr(0.5)).toBe(1);
    expect(clampDpr(0)).toBe(1);
    expect(clampDpr(Number.NaN)).toBe(1);
    expect(clampDpr(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('渲染倍率：小舞台按设备像素比（上限 2），大舞台按像素总数上限压低，但不低于 1', () => {
    expect(renderScale(640, 400, 3)).toBe(2);
    expect(renderScale(640, 400, 1)).toBe(1);
    const big = renderScale(1920, 1080, 2);
    expect(big).toBeGreaterThanOrEqual(1);
    expect(big).toBeLessThan(2);
    expect(1920 * 1080 * big * big).toBeLessThanOrEqual(MAX_CANVAS_PIXELS * 1.001);
    expect(renderScale(8000, 6000, 2)).toBe(1);
    expect(renderScale(0, 0, 2)).toBe(2);
    expect(renderScale(100, 100, Number.NaN)).toBe(1);
  });

  it('帧间隔由帧率换算，帧率无效时退回 20 帧 / 秒', () => {
    expect(frameIntervalMs(20)).toBe(50);
    expect(frameIntervalMs(10)).toBe(100);
    expect(frameIntervalMs(0)).toBe(50);
    expect(frameIntervalMs(Number.NaN)).toBe(50);
  });

  it('限帧：未到间隔不出帧，到点（容忍 2ms 抖动）出帧', () => {
    expect(shouldRenderFrame(100, 100, 50)).toBe(false);
    expect(shouldRenderFrame(133, 100, 50)).toBe(false);
    expect(shouldRenderFrame(148, 100, 50)).toBe(true);
    expect(shouldRenderFrame(150, 100, 50)).toBe(true);
    expect(shouldRenderFrame(10, Number.NEGATIVE_INFINITY, 50)).toBe(true);
  });
});

describe('数字雨 · 档位', () => {
  it('帧率不超过 24，且两档都合理', () => {
    for (const p of [desktop, mobile]) {
      expect(p.fps).toBeGreaterThan(0);
      expect(p.fps).toBeLessThanOrEqual(24);
      expect(p.activeRatio).toBeGreaterThan(0);
      expect(p.activeRatio).toBeLessThanOrEqual(1);
      expect(p.fade).toBeGreaterThan(0);
      expect(p.fade).toBeLessThan(1);
      expect(p.headAlpha).toBeGreaterThanOrEqual(p.bodyAlpha);
    }
  });

  it('移动端更稀、更暗、帧率不高于桌面', () => {
    expect(mobile.activeRatio).toBeLessThan(desktop.activeRatio);
    expect(mobile.columnWidth).toBeGreaterThan(desktop.columnWidth);
    expect(mobile.bodyAlpha).toBeLessThan(desktop.bodyAlpha);
    expect(mobile.headAlpha).toBeLessThan(desktop.headAlpha);
    expect(mobile.fps).toBeLessThanOrEqual(desktop.fps);
  });
});

describe('数字雨 · 状态推进', () => {
  it('按尺寸建列，雨滴起点落在画面高度之内，列速度在 0.6–1.4 倍', () => {
    const s = createRainState(800, 600, desktop, mulberry32(1));
    expect(s.columns).toBe(columnCount(800, desktop.columnWidth));
    expect(s.drops).toHaveLength(s.columns);
    for (let c = 0; c < s.columns; c++) {
      expect(s.drops[c]).toBeGreaterThanOrEqual(0);
      expect(s.drops[c]).toBeLessThan(600);
      expect(s.speeds[c]).toBeGreaterThanOrEqual(0.6);
      expect(s.speeds[c]).toBeLessThanOrEqual(1.4);
    }
  });

  it('参与下雨的列占比接近 activeRatio；移动端比桌面稀', () => {
    const w = 1600;
    const dState = createRainState(w, 600, desktop, mulberry32(3));
    const mState = createRainState(w, 600, mobile, mulberry32(3));
    const share = (s: { active: Uint8Array; columns: number }) =>
      s.active.reduce((a, v) => a + v, 0) / s.columns;
    expect(share(dState)).toBeGreaterThan(desktop.activeRatio - 0.15);
    expect(share(dState)).toBeLessThan(Math.min(1, desktop.activeRatio + 0.15) + 1e-9);
    expect(share(mState)).toBeLessThan(share(dState));
  });

  it('同一种子建出同一个状态', () => {
    const a = createRainState(640, 480, desktop, mulberry32(9));
    const b = createRainState(640, 480, desktop, mulberry32(9));
    expect(Array.from(a.drops)).toEqual(Array.from(b.drops));
    expect(Array.from(a.active)).toEqual(Array.from(b.active));
  });

  it('一步让每滴雨下落 stepPx × 列速度', () => {
    const s = createRainState(320, 10_000, desktop, mulberry32(5));
    const before = Array.from(s.drops);
    stepRain(s, 10_000, desktop, mulberry32(5));
    for (let c = 0; c < s.columns; c++) {
      expect(s.drops[c]).toBeCloseTo(before[c]! + desktop.stepPx * s.speeds[c]!, 3);
    }
  });

  it('掉出画面之后按概率回到顶部：随机数小则留在原地继续落，大则重置为 0', () => {
    const s = createRainState(32, 100, desktop, mulberry32(2));
    s.drops[0] = 500;
    stepRain(s, 100, desktop, () => 0.5);
    expect(s.drops[0]).toBeGreaterThan(500);
    s.drops[0] = 500;
    stepRain(s, 100, desktop, () => 0.99);
    expect(s.drops[0]).toBe(0);
  });

  it('零宽画面没有列，推进也不出错', () => {
    const s = createRainState(0, 0, desktop, mulberry32(1));
    expect(s.columns).toBe(0);
    expect(() => stepRain(s, 0, desktop, mulberry32(1))).not.toThrow();
  });
});

describe('数字雨 · 开关', () => {
  it('解析 data-fx-off：空格分隔、去重、忽略空串与 null', () => {
    expect(parseFxOff(null).size).toBe(0);
    expect(parseFxOff('').size).toBe(0);
    expect([...parseFxOff('rain scan')].sort()).toEqual(['rain', 'scan']);
    expect([...parseFxOff('  rain   rain\tdesat ')].sort()).toEqual(['desat', 'rain']);
  });

  it('关掉 rain 就是 off，优先于减少动效', () => {
    expect(
      resolveRainMode({ fxOff: parseFxOff('rain'), reducedMotion: false, motionAttr: null }),
    ).toBe('off');
    expect(
      resolveRainMode({ fxOff: parseFxOff('rain'), reducedMotion: true, motionAttr: 'reduced' }),
    ).toBe('off');
  });

  it('系统减少动效或 data-motion=reduced 时只画静态一帧', () => {
    const none = parseFxOff(null);
    expect(resolveRainMode({ fxOff: none, reducedMotion: true, motionAttr: null })).toBe('static');
    expect(resolveRainMode({ fxOff: none, reducedMotion: false, motionAttr: 'reduced' })).toBe(
      'static',
    );
  });

  it('data-motion=full 盖过系统的减少动效偏好：照常运行；rain 开关仍然优先', () => {
    const none = parseFxOff(null);
    expect(resolveRainMode({ fxOff: none, reducedMotion: true, motionAttr: 'full' })).toBe(
      'running',
    );
    expect(
      resolveRainMode({ fxOff: parseFxOff('rain'), reducedMotion: true, motionAttr: 'full' }),
    ).toBe('off');
  });

  it('其它情况下运行；别的特效开关不影响数字雨', () => {
    expect(
      resolveRainMode({ fxOff: parseFxOff('scan desat'), reducedMotion: false, motionAttr: null }),
    ).toBe('running');
    expect(
      resolveRainMode({ fxOff: parseFxOff(null), reducedMotion: false, motionAttr: 'full' }),
    ).toBe('running');
  });
});
