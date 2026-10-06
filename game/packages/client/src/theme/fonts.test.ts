import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadThemeFonts, resetThemeFontLoading } from './fonts';
import { SKINS } from './skins';

beforeEach(() => {
  resetThemeFontLoading();
});

describe('loadThemeFonts', () => {
  it('没有自带字体的主题直接完成，不触发任何加载', async () => {
    await expect(loadThemeFonts('noir', undefined)).resolves.toBeUndefined();
    await expect(loadThemeFonts('matrix')).resolves.toBeUndefined();
  });

  it('带字体的主题触发一次加载；重复应用同一主题不重复加载', async () => {
    const loader = vi.fn().mockResolvedValue({});
    await loadThemeFonts('butterfly', loader);
    await loadThemeFonts('butterfly', loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('并发的两次调用共用同一次加载', async () => {
    let release!: () => void;
    const loader = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const a = loadThemeFonts('butterfly', loader);
    const b = loadThemeFonts('butterfly', loader);
    expect(loader).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([a, b]);
  });

  it('加载失败不抛出（界面继续用回落字体），下次应用主题时重试', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
    await expect(loadThemeFonts('butterfly', loader)).resolves.toBeUndefined();
    await loadThemeFonts('butterfly', loader);
    expect(loader).toHaveBeenCalledTimes(2);
    await loadThemeFonts('butterfly', loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('皮肤上登记的加载函数能真的引入字体样式', async () => {
    expect(typeof SKINS.butterfly.loadFonts).toBe('function');
    await expect(SKINS.butterfly.loadFonts!()).resolves.toBeDefined();
  });

  it('默认取当前主题的皮肤上登记的加载函数；没有登记的主题不加载', async () => {
    await expect(loadThemeFonts('noir')).resolves.toBeUndefined();
    await expect(loadThemeFonts('butterfly')).resolves.toBeUndefined();
  });
});
