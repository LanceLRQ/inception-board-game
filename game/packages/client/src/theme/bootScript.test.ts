import { describe, expect, it } from 'vitest';
import { buildThemeBootScript } from './bootScript';
import { DEFAULT_THEME_ID, THEMES, THEME_STORAGE_KEY } from './themes';

interface FakeDoc {
  attrs: Record<string, string>;
  metaContent: string | null;
  document: unknown;
}

/** 伪造最小 document：根元素属性 + theme-color meta */
function makeDoc(withMeta = true): FakeDoc {
  const state: FakeDoc = { attrs: {}, metaContent: withMeta ? '#000000' : null, document: null };
  state.document = {
    documentElement: {
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
});
