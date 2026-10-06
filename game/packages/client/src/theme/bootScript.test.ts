import { describe, expect, it } from 'vitest';
import { buildThemeBootScript } from './bootScript';
import { EFFECTS_STORAGE_KEY, fxOffAttribute, parseEffectPrefs } from './effects';
import { DEFAULT_THEME_ID, THEMES, THEME_STORAGE_KEY } from './themes';

interface FakeDoc {
  attrs: Record<string, string>;
  style: { backgroundColor: string; colorScheme: string };
  metaContent: string | null;
  document: unknown;
}

/** 伪造最小 document：根元素属性 + theme-color meta */
function makeDoc(withMeta = true): FakeDoc {
  const state: FakeDoc = {
    attrs: {},
    style: { backgroundColor: '', colorScheme: '' },
    metaContent: withMeta ? '#000000' : null,
    document: null,
  };
  state.document = {
    documentElement: {
      style: state.style,
      setAttribute: (k: string, v: string) => {
        state.attrs[k] = v;
      },
    },
    querySelector: (sel: string) => {
      if (!withMeta || sel !== 'meta[name="theme-color"]') return null;
      return {
        setAttribute: (k: string, v: string) => {
          if (k === 'content') state.metaContent = v;
        },
      };
    },
  };
  return state;
}

function run(doc: FakeDoc, storage: unknown): void {
  new Function('document', 'localStorage', buildThemeBootScript())(doc.document, storage);
}

describe('buildThemeBootScript', () => {
  it('存了合法主题 id 时应用该主题', () => {
    const doc = makeDoc();
    run(doc, { getItem: (k: string) => (k === THEME_STORAGE_KEY ? 'noir' : null) });
    expect(doc.attrs['data-theme']).toBe('noir');
    expect(doc.attrs['data-scheme']).toBe(THEMES.noir.scheme);
    expect(doc.metaContent).toBe(THEMES.noir.themeColor);
  });

  it('存了旧值 light 时回落到默认主题', () => {
    const doc = makeDoc();
    run(doc, { getItem: () => 'light' });
    expect(doc.attrs['data-theme']).toBe(DEFAULT_THEME_ID);
    expect(doc.attrs['data-scheme']).toBe('dark');
    expect(doc.metaContent).toBe('#0A0D13');
  });

  it('没存任何值时用默认主题', () => {
    const doc = makeDoc();
    run(doc, { getItem: () => null });
    expect(doc.attrs['data-theme']).toBe(DEFAULT_THEME_ID);
    expect(doc.metaContent).toBe('#0A0D13');
  });

  it('localStorage 抛错时落到默认主题', () => {
    const doc = makeDoc();
    run(doc, {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(doc.attrs['data-theme']).toBe(DEFAULT_THEME_ID);
    expect(doc.attrs['data-scheme']).toBe('dark');
  });

  it('localStorage 本身不可用（访问即抛错）时也不崩', () => {
    const doc = makeDoc();
    const storage = new Proxy(
      {},
      {
        get() {
          throw new Error('denied');
        },
      },
    );
    run(doc, storage);
    expect(doc.attrs['data-theme']).toBe(DEFAULT_THEME_ID);
  });

  it('原型链上的名字不当作主题', () => {
    const doc = makeDoc();
    run(doc, { getItem: () => 'toString' });
    expect(doc.attrs['data-theme']).toBe(DEFAULT_THEME_ID);
  });

  it('页面没有 theme-color meta 时只设属性', () => {
    const doc = makeDoc(false);
    run(doc, { getItem: () => 'noir' });
    expect(doc.attrs['data-theme']).toBe('noir');
    expect(doc.metaContent).toBeNull();
  });

  it('亮色主题：data-scheme=light，底色与控件配色在首屏就写到根元素上（样式表到位之前不闪深色）', () => {
    const doc = makeDoc();
    run(doc, { getItem: (k: string) => (k === THEME_STORAGE_KEY ? 'butterfly' : null) });
    expect(doc.attrs['data-theme']).toBe('butterfly');
    expect(doc.attrs['data-scheme']).toBe('light');
    expect(doc.style.backgroundColor).toBe(THEMES.butterfly.tokens.bg);
    expect(doc.style.colorScheme).toBe('light');
    expect(doc.metaContent).toBe(THEMES.butterfly.themeColor);
  });

  it('暗色主题的底色取自各自的 bg 令牌', () => {
    const doc = makeDoc();
    run(doc, { getItem: () => 'matrix' });
    expect(doc.style.backgroundColor).toBe(THEMES.matrix.tokens.bg);
    expect(doc.style.colorScheme).toBe('dark');
  });

  it('根元素没有 style 时只设属性，不报错', () => {
    const doc = makeDoc();
    (doc.document as { documentElement: { style?: unknown } }).documentElement.style = undefined;
    expect(() => run(doc, { getItem: () => 'butterfly' })).not.toThrow();
    expect(doc.attrs['data-scheme']).toBe('light');
  });
});

describe('buildThemeBootScript · 效果偏好', () => {
  const withPrefs = (raw: string | null) => (k: string) => (k === EFFECTS_STORAGE_KEY ? raw : null);

  it('没存偏好时不写 data-fx-off 与 data-motion', () => {
    const doc = makeDoc();
    run(doc, { getItem: withPrefs(null) });
    expect(doc.attrs['data-fx-off']).toBeUndefined();
    expect(doc.attrs['data-motion']).toBeUndefined();
  });

  it('关闭的开关写成空格分隔的内部名字，与运行时 fxOffAttribute 一致', () => {
    const doc = makeDoc();
    const raw = JSON.stringify({ off: ['tint', 'ambient', 'scan'], motion: 'system' });
    run(doc, { getItem: withPrefs(raw) });
    expect(doc.attrs['data-fx-off']).toBe(fxOffAttribute(parseEffectPrefs(raw)));
    expect(doc.attrs['data-fx-off']).toBe('rain totem flow blink drift scan tint');
    expect(doc.attrs['data-motion']).toBeUndefined();
  });

  it('总是减少写 data-motion=reduced，不减少写 data-motion=full', () => {
    const a = makeDoc();
    run(a, { getItem: withPrefs(JSON.stringify({ off: [], motion: 'reduce' })) });
    expect(a.attrs['data-motion']).toBe('reduced');
    const b = makeDoc();
    run(b, { getItem: withPrefs(JSON.stringify({ off: [], motion: 'full' })) });
    expect(b.attrs['data-motion']).toBe('full');
  });

  it.each([
    'not json',
    'null',
    '42',
    '[]',
    '{"off":"scan","motion":"sideways"}',
    '{"off":["__proto__","bogus",1]}',
  ])('无效内容 %s 不写属性、不抛错', (raw) => {
    const doc = makeDoc();
    expect(() => run(doc, { getItem: withPrefs(raw) })).not.toThrow();
    expect(doc.attrs['data-fx-off']).toBeUndefined();
    expect(doc.attrs['data-motion']).toBeUndefined();
    expect(doc.attrs['data-theme']).toBe(DEFAULT_THEME_ID);
  });

  it('读取偏好抛错时主题照常应用', () => {
    const doc = makeDoc();
    run(doc, {
      getItem: (k: string) => {
        if (k === EFFECTS_STORAGE_KEY) throw new Error('blocked');
        return 'matrix';
      },
    });
    expect(doc.attrs['data-theme']).toBe('matrix');
    expect(doc.attrs['data-fx-off']).toBeUndefined();
  });

  it('偏好与解析函数对同一输入给出同样的结果', () => {
    for (const raw of [
      JSON.stringify({ off: ['texture'], motion: 'reduce' }),
      JSON.stringify({ off: ['desat', 'scan', 'bogus'], motion: 'full' }),
      '{"off":[]}',
    ]) {
      const doc = makeDoc();
      run(doc, { getItem: withPrefs(raw) });
      const prefs = parseEffectPrefs(raw);
      expect(doc.attrs['data-fx-off'] ?? '').toBe(fxOffAttribute(prefs));
    }
  });
});
