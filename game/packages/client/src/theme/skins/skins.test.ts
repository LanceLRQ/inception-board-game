// 皮肤注册表与皮肤样式的一致性：新增主题漏了皮肤、皮肤样式串到别的主题、写了颜色字面量都会被这里拦住

import { describe, expect, it } from 'vitest';
import indexCss from '../../styles/index.css?raw';
import baseCss from '../../styles/skins/base.css?raw';
import { THEME_IDS } from '../themes';
import { SKINS, getSkin } from './index';

const skinCss = import.meta.glob('../../styles/skins/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 十六进制、rgb()/rgba()、hsl()/hsla() 颜色字面量 */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/;

/** 所有规则块的选择器（跳过 @ 规则本身）；keyframes 里的 from / to / 百分比不算 */
function selectors(css: string): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripComments(css)))) {
    const prelude = m[1]!.trim();
    if (prelude.startsWith('@')) continue;
    out.push(...prelude.split(',').map((s) => s.trim()));
  }
  return out;
}

/** 基础样式要提供的钩子类名 */
const HOOKS = [
  'ms-stage',
  'ms-center',
  'ms-topbar',
  'ms-seat',
  'ms-card',
  'ms-layerbadge',
  'ms-die',
  'ms-handcard',
  'ms-dock',
  'ms-btn',
  'ms-response',
];

describe('皮肤注册表', () => {
  it.each(THEME_IDS)('主题 %s 有一份皮肤，id 与键一致', (id) => {
    const skin = getSkin(id);
    expect(skin).toBeDefined();
    expect(skin.id).toBe(id);
    expect(SKINS[id]).toBe(skin);
  });

  it.each(THEME_IDS)('主题 %s 的中央舞台是懒加载组件（独立 chunk，不进首屏包）', (id) => {
    const lazyTag = Symbol.for('react.lazy');
    expect((getSkin(id).CenterStage as unknown as { $$typeof: symbol }).$$typeof).toBe(lazyTag);
  });

  it.each(THEME_IDS)('主题 %s 的中央舞台占位参数合理', (id) => {
    const { center } = getSkin(id);
    expect(center.widthRatio).toBeGreaterThan(0);
    expect(center.widthRatio).toBeLessThan(1);
    expect(center.minWidth).toBeGreaterThan(0);
    expect(center.maxWidth).toBeGreaterThanOrEqual(center.minWidth);
    expect(center.minHeight).toBeGreaterThan(0);
  });

  it('注册表里没有多余的主题', () => {
    expect(Object.keys(SKINS).sort()).toEqual([...THEME_IDS].sort());
  });
});

describe('皮肤样式', () => {
  it.each(THEME_IDS)('主题 %s 有 styles/skins/%s.css 且由 index.css 引入', (id) => {
    expect(Object.keys(skinCss)).toContain(`../../styles/skins/${id}.css`);
    expect(indexCss).toContain(`./skins/${id}.css`);
  });

  it('index.css 引入了基础样式', () => {
    expect(indexCss).toContain('./skins/base.css');
  });

  it('基础样式提供全部钩子类名', () => {
    const all = selectors(baseCss).join(' ');
    for (const hook of HOOKS) expect(all, hook).toContain(`.${hook}`);
  });

  it('基础样式与各主题的皮肤样式里没有颜色字面量', () => {
    for (const [file, css] of Object.entries(skinCss)) {
      expect(stripComments(css), file).not.toMatch(COLOR_LITERAL);
    }
  });

  it('颜色字面量的检测确实能识别', () => {
    for (const bad of [
      'color: #fff;',
      'color:#A8443A',
      'a: rgb(1,2,3)',
      'a: rgba(0 0 0 / 1)',
      'a: hsl(0 0% 0%)',
    ]) {
      expect(bad).toMatch(COLOR_LITERAL);
    }
    expect('color: color-mix(in srgb, var(--ms-acc) 40%, transparent);').not.toMatch(COLOR_LITERAL);
    expect('width: 100%; background: url(%23n);').not.toMatch(COLOR_LITERAL);
  });

  it.each(THEME_IDS)('主题 %s 的皮肤样式全部限定在 [data-theme] 之下', (id) => {
    const css = skinCss[`../../styles/skins/${id}.css`]!;
    const list = selectors(css);
    expect(list.length).toBeGreaterThan(0);
    for (const sel of list) expect(sel.startsWith(`[data-theme='${id}']`), sel).toBe(true);
  });

  it('基础样式不限定主题（缺省外观对所有主题生效）', () => {
    for (const sel of selectors(baseCss)) {
      expect(sel, sel).not.toContain('[data-theme');
    }
  });
});

describe('「筑梦蓝图」皮肤样式', () => {
  const css = stripComments(skinCss['../../styles/skins/blueprint.css']!);

  it('专属类名都带 blueprint- 前缀，不借用别的主题的类名', () => {
    const classes = new Set(
      selectors(css).flatMap((s) => [...s.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]!)),
    );
    for (const name of classes) {
      expect(name.startsWith('ms-') || name.startsWith('blueprint-'), name).toBe(true);
    }
    expect(css).not.toContain('noir-');
  });

  it('动效在系统「减少动效」与 data-motion=reduced 下都会停掉', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(":root[data-motion='reduced']");
  });

  it('装饰效果各有独立的 data-fx-off 开关', () => {
    for (const fx of ['grid', 'totem', 'flow']) {
      expect(css, fx).toContain(`:root[data-fx-off~='${fx}']`);
    }
  });

  it('关键帧由基础样式提供（皮肤样式里的规则必须限定在主题之下，放不了关键帧）', () => {
    expect(css).not.toContain('@keyframes');
    for (const name of ['ms-spin', 'ms-flow']) {
      expect(baseCss).toContain(`@keyframes ${name}`);
      expect(css).toContain(name);
    }
  });
});
