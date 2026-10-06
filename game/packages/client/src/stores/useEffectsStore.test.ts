import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EFFECTS_STORAGE_KEY, DEFAULT_EFFECT_PREFS } from '../theme/effects';

/** 最小的 localStorage 替身 */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

/** store 在模块加载时读 localStorage，所以每个用例重新加载模块 */
async function loadStore() {
  vi.resetModules();
  return (await import('./useEffectsStore')).useEffectsStore;
}

describe('useEffectsStore', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('没有 localStorage 时用缺省偏好', async () => {
    vi.stubGlobal('localStorage', undefined);
    const store = await loadStore();
    expect(store.getState().prefs).toEqual(DEFAULT_EFFECT_PREFS);
    expect(() => store.getState().setEffectOn('scan', false)).not.toThrow();
    expect(store.getState().prefs.off).toEqual(['scan']);
  });

  it('读取已存的偏好', async () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({ [EFFECTS_STORAGE_KEY]: JSON.stringify({ off: ['tint'], motion: 'reduce' }) }),
    );
    const store = await loadStore();
    expect(store.getState().prefs).toEqual({ off: ['tint'], motion: 'reduce' });
  });

  it('已存的内容无效时回落到缺省', async () => {
    vi.stubGlobal('localStorage', fakeStorage({ [EFFECTS_STORAGE_KEY]: '{oops' }));
    const store = await loadStore();
    expect(store.getState().prefs).toEqual(DEFAULT_EFFECT_PREFS);
  });

  it('读取 localStorage 抛错时回落到缺省', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    const store = await loadStore();
    expect(store.getState().prefs).toEqual(DEFAULT_EFFECT_PREFS);
  });

  it('修改开关与减少动效会写回 localStorage', async () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const store = await loadStore();
    store.getState().setEffectOn('ambient', false);
    store.getState().setMotion('full');
    expect(JSON.parse(storage.data.get(EFFECTS_STORAGE_KEY)!)).toEqual({
      off: ['ambient'],
      motion: 'full',
    });
    store.getState().setEffectOn('ambient', true);
    expect(JSON.parse(storage.data.get(EFFECTS_STORAGE_KEY)!)).toEqual({ off: [], motion: 'full' });
  });

  it('写入失败（隐私模式）不影响内存里的偏好', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    const store = await loadStore();
    expect(() => store.getState().setMotion('reduce')).not.toThrow();
    expect(store.getState().prefs.motion).toBe('reduce');
  });
});
