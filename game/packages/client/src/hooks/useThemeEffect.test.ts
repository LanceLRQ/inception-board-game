import { describe, expect, it } from 'vitest';
import {
  applyEffects,
  applyTheme,
  type EffectsDocument,
  type ThemeDocument,
} from './useThemeEffect';
import { getTheme, type ThemeDefinition } from '../theme/themes';

function makeDoc(withMeta = true) {
  const rootAttrs: Record<string, string> = {};
  const style = { backgroundColor: '', colorScheme: '' };
  const metaAttrs: Record<string, string> = {};
  const doc: ThemeDocument = {
    documentElement: {
      style,
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
  return { doc, rootAttrs, metaAttrs, style };
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

  it('同步写入底色与控件配色：亮色主题落 light，暗色主题落 dark', () => {
    const { doc, style } = makeDoc();
    applyTheme(getTheme('butterfly'), doc);
    expect(style).toEqual({ backgroundColor: '#F0EBDF', colorScheme: 'light' });
    applyTheme(getTheme('noir'), doc);
    expect(style).toEqual({ backgroundColor: '#0A0D13', colorScheme: 'dark' });
  });

  it('根元素没有 style 的替身也能用', () => {
    const doc: ThemeDocument = {
      documentElement: { setAttribute: () => undefined },
      querySelector: () => null,
    };
    expect(() => applyTheme(getTheme('butterfly'), doc)).not.toThrow();
  });
});

function makeEffectsDoc() {
  const attrs: Record<string, string> = {};
  const doc: EffectsDocument = {
    documentElement: {
      setAttribute: (k, v) => {
        attrs[k] = v;
      },
      removeAttribute: (k) => {
        delete attrs[k];
      },
    },
  };
  return { doc, attrs };
}

describe('applyEffects', () => {
  it('缺省偏好不写任何属性', () => {
    const { doc, attrs } = makeEffectsDoc();
    applyEffects({ off: [], motion: 'system' }, doc);
    expect(attrs).toEqual({});
  });

  it('关闭的开关写成空格分隔的内部名字，总是减少写 data-motion=reduced', () => {
    const { doc, attrs } = makeEffectsDoc();
    applyEffects({ off: ['scan', 'tint'], motion: 'reduce' }, doc);
    expect(attrs).toEqual({ 'data-fx-off': 'scan tint', 'data-motion': 'reduced' });
  });

  it('不减少写 data-motion=full', () => {
    const { doc, attrs } = makeEffectsDoc();
    applyEffects({ off: [], motion: 'full' }, doc);
    expect(attrs).toEqual({ 'data-motion': 'full' });
  });

  it('偏好恢复缺省时移除先前写下的属性', () => {
    const { doc, attrs } = makeEffectsDoc();
    applyEffects({ off: ['desat'], motion: 'reduce' }, doc);
    applyEffects({ off: [], motion: 'system' }, doc);
    expect(attrs).toEqual({});
  });
});
