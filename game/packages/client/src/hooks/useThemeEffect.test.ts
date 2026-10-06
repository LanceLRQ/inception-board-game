import { describe, expect, it } from 'vitest';
import { applyTheme, type ThemeDocument } from './useThemeEffect';
import { getTheme, type ThemeDefinition } from '../theme/themes';

function makeDoc(withMeta = true) {
  const rootAttrs: Record<string, string> = {};
  const metaAttrs: Record<string, string> = {};
  const doc: ThemeDocument = {
    documentElement: {
      setAttribute: (k, v) => {
        rootAttrs[k] = v;
      },
    },
    querySelector: (sel) =>
      withMeta && sel === 'meta[name="theme-color"]'
        ? {
            setAttribute: (k, v) => {
              metaAttrs[k] = v;
            },
          }
        : null,
  };
  return { doc, rootAttrs, metaAttrs };
}

describe('applyTheme', () => {
  it('设置主题 id、明暗属性与 theme-color', () => {
    const { doc, rootAttrs, metaAttrs } = makeDoc();
    applyTheme(getTheme('noir'), doc);
    expect(rootAttrs).toEqual({ 'data-theme': 'noir', 'data-scheme': 'dark' });
    expect(metaAttrs).toEqual({ content: '#0A0D13' });
  });

  it('亮色主题写入 data-scheme=light 与对应主题色', () => {
    const light: ThemeDefinition = {
      ...getTheme('noir'),
      id: 'paper',
      scheme: 'light',
      themeColor: '#F4EFE4',
    };
    const { doc, rootAttrs, metaAttrs } = makeDoc();
    applyTheme(light, doc);
    expect(rootAttrs['data-theme']).toBe('paper');
    expect(rootAttrs['data-scheme']).toBe('light');
    expect(metaAttrs['content']).toBe('#F4EFE4');
  });

  it('没有 theme-color meta 时不报错', () => {
    const { doc, rootAttrs } = makeDoc(false);
    expect(() => applyTheme(getTheme('noir'), doc)).not.toThrow();
    expect(rootAttrs['data-theme']).toBe('noir');
  });

  it('不再改动 .dark 类名', () => {
    const { doc } = makeDoc();
    expect('classList' in doc.documentElement).toBe(false);
    expect(() => applyTheme(getTheme('noir'), doc)).not.toThrow();
  });
});
