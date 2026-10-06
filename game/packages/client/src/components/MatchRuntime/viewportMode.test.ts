import { describe, expect, it } from 'vitest';
import css from '../../styles/index.css?raw';
import {
  COMPACT_LANDSCAPE_QUERY,
  DESKTOP_BASE_HEIGHT,
  DESKTOP_BASE_WIDTH,
  DESKTOP_SCALE_MAX,
  TABLET_QUERY,
  desktopScale,
  resolveMobileMode,
} from './viewportMode';

describe('resolveMobileMode', () => {
  it('矮屏横屏优先于平板', () => {
    expect(resolveMobileMode({ compactLandscape: true, tablet: true })).toBe('compact-landscape');
    expect(resolveMobileMode({ compactLandscape: true, tablet: false })).toBe('compact-landscape');
  });
  it('平板与手机', () => {
    expect(resolveMobileMode({ compactLandscape: false, tablet: true })).toBe('tablet');
    expect(resolveMobileMode({ compactLandscape: false, tablet: false })).toBe('phone');
  });
});

describe('desktopScale', () => {
  it('参照尺寸及略大的视口保持 1:1', () => {
    expect(desktopScale(DESKTOP_BASE_WIDTH, DESKTOP_BASE_HEIGHT)).toBe(1);
    expect(desktopScale(1024, 768)).toBe(1);
    expect(desktopScale(1440, 900)).toBe(1);
    expect(desktopScale(1536, 864)).toBe(1);
  });
  it('大屏按宽高里较小的比例放大', () => {
    expect(desktopScale(1920, 1080)).toBe(1.35);
    expect(desktopScale(2560, 1440)).toBe(1.8);
    expect(desktopScale(1680, 1050)).toBe(1.31);
  });
  it('超宽屏按高度受限，不超过上限', () => {
    expect(desktopScale(3440, 1440)).toBe(1.8);
    expect(desktopScale(7680, 4320)).toBe(DESKTOP_SCALE_MAX);
  });
  it('放大后的虚拟视口不小于参照尺寸', () => {
    for (const [w, h] of [
      [1920, 1080],
      [2560, 1440],
      [1680, 1050],
      [3440, 1440],
      [2200, 1000],
    ] as const) {
      const s = desktopScale(w, h);
      expect(w / s).toBeGreaterThanOrEqual(DESKTOP_BASE_WIDTH - 1);
      expect(h / s).toBeGreaterThanOrEqual(DESKTOP_BASE_HEIGHT - 1);
    }
  });
  it('非法尺寸回落 1', () => {
    expect(desktopScale(0, 1080)).toBe(1);
    expect(desktopScale(Number.NaN, 1080)).toBe(1);
  });
});

describe('与样式表的自定义变体一致', () => {
  it('tablet 与 short-land 变体的查询串与脚本里的一致', () => {
    expect(css).toContain(`@custom-variant tablet (@media ${TABLET_QUERY});`);
    expect(css).toContain(`@custom-variant short-land (@media ${COMPACT_LANDSCAPE_QUERY});`);
  });
});
