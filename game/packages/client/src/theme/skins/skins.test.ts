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

  it("系统「减少动效」的媒体查询里，每条规则都要让位给 data-motion='full'（用户选「不减少」时盖过系统偏好）", () => {
    const sources: Record<string, string> = { 'index.css': indexCss, ...skinCss };
    let blocks = 0;
    for (const [file, css] of Object.entries(sources)) {
      const text = stripComments(css);
      const re = /@media \(prefers-reduced-motion: reduce\)\s*\{/g;
      while (re.exec(text)) {
        blocks++;
        // 取这个 @media 块的主体（大括号配平）
        let depth = 1;
        let i = re.lastIndex;
        while (i < text.length && depth > 0) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') depth--;
          i++;
        }
        const body = text.slice(re.lastIndex, i - 1);
        const list = selectors(body);
        expect(list.length, file).toBeGreaterThan(0);
        for (const sel of list) {
          expect(sel, `${file}: ${sel}`).toContain(":not([data-motion='full'])");
        }
      }
    }
    expect(blocks).toBeGreaterThanOrEqual(5);
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

describe('「陀螺未停」皮肤样式', () => {
  const css = stripComments(skinCss['../../styles/skins/totem.css']!);

  it('专属类名都带 totem- 前缀，不借用别的主题的类名', () => {
    const classes = new Set(
      selectors(css).flatMap((s) => [...s.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]!)),
    );
    for (const name of classes) {
      expect(name.startsWith('ms-') || name.startsWith('totem-'), name).toBe(true);
    }
    expect(css).not.toContain('noir-');
    expect(css).not.toContain('blueprint-');
  });

  it('动效在系统「减少动效」与 data-motion=reduced 下都会停掉', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(":root[data-motion='reduced']");
  });

  it('装饰效果各有独立的 data-fx-off 开关；同类效果沿用 blueprint 的名字', () => {
    for (const fx of ['maze', 'totem', 'flow']) {
      expect(css, fx).toContain(`:root[data-fx-off~='${fx}']`);
    }
  });

  it('层级调色可由 data-fx-off="tint" 关闭：所有调色规则都排除了它', () => {
    const tintRules = selectors(css).filter(
      (s) => s.includes('data-tint-layer') || / \[data-layer='[0-4]'\]$/.test(s),
    );
    expect(tintRules.length).toBeGreaterThan(0);
    for (const sel of tintRules) {
      expect(sel, sel).toContain(":not([data-fx-off~='tint'])");
    }
  });

  it('每一层（0–4）都有自己的层色规则，第 1–4 层引用 --ms-totem-l<层号>', () => {
    for (const layer of [0, 1, 2, 3, 4]) {
      expect(css, `data-layer=${layer}`).toContain(`[data-layer='${layer}']`);
    }
    for (const layer of [1, 2, 3, 4]) {
      expect(css, `l${layer}`).toContain(`var(--ms-totem-l${layer})`);
    }
  });

  it('关键帧由基础样式提供，皮肤只引用', () => {
    expect(css).not.toContain('@keyframes');
    for (const name of ['ms-spin', 'ms-flow', 'ms-dash', 'ms-wobble']) {
      expect(baseCss).toContain(`@keyframes ${name}`);
    }
    for (const name of ['ms-flow', 'ms-dash', 'ms-wobble']) expect(css).toContain(name);
  });
});

describe('「梦境矩阵」皮肤样式', () => {
  const css = stripComments(skinCss['../../styles/skins/matrix.css']!);

  it('专属类名都带 matrix- 前缀，不借用别的主题的类名', () => {
    const classes = new Set(
      selectors(css).flatMap((s) => [...s.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]!)),
    );
    expect(classes.size).toBeGreaterThan(0);
    for (const name of classes) {
      expect(name.startsWith('ms-') || name.startsWith('matrix-'), name).toBe(true);
    }
    for (const other of ['noir-', 'blueprint-', 'totem-']) expect(css).not.toContain(other);
  });

  it('动效在系统「减少动效」与 data-motion=reduced 下都会停掉', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(":root[data-motion='reduced']");
  });

  it('装饰效果各有独立的 data-fx-off 开关：rain / scan / desat / blink', () => {
    for (const fx of ['rain', 'scan', 'desat', 'blink']) {
      expect(css, fx).toContain(`[data-fx-off~='${fx}']`);
    }
  });

  it('扫描线是不拦截指针的纯 CSS 叠层，低于弹窗的层级，且可被 scan 开关关闭', () => {
    const rule = css.match(/\[data-layout\]::after\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toContain('pointer-events: none');
    expect(rule![0]).toContain('repeating-linear-gradient');
    expect(Number(rule![0].match(/z-index:\s*(\d+)/)![1])).toBeLessThan(50);
    expect(css).toContain(":root:not([data-fx-off~='scan']) [data-layout]::after");
  });

  it('卡图降饱和可被 desat 开关关闭，只作用于对局里的卡图（不碰弹窗）', () => {
    const filterRules = selectors(css).filter((s) => /\bimg\b/.test(s));
    expect(filterRules.length).toBeGreaterThan(0);
    for (const sel of filterRules) {
      expect(sel, sel).toContain(":not([data-fx-off~='desat'])");
      expect(sel, sel).toMatch(/\.ms-card|\.ms-handcard-art|\[data-layout='mobile'\]/);
    }
    expect(css).toMatch(/filter:\s*saturate\(/);
  });

  it('不使用层级调色：没有任何 data-tint-layer 规则', () => {
    expect(css).not.toContain('data-tint-layer');
  });

  it('关键帧由基础样式提供，皮肤只引用', () => {
    expect(css).not.toContain('@keyframes');
    expect(baseCss).toContain('@keyframes ms-blink');
    expect(css).toContain('ms-blink');
  });
});

describe('「庄周梦蝶」皮肤样式', () => {
  const css = stripComments(skinCss['../../styles/skins/butterfly.css']!);

  it('专属类名都带 butterfly- 前缀，不借用别的主题的类名', () => {
    const classes = new Set(
      selectors(css).flatMap((s) => [...s.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]!)),
    );
    expect(classes.size).toBeGreaterThan(0);
    for (const name of classes) {
      expect(name.startsWith('ms-') || name.startsWith('butterfly-'), name).toBe(true);
    }
    for (const other of ['noir-', 'blueprint-', 'totem-', 'matrix-']) {
      expect(css).not.toContain(other);
    }
  });

  it('动效在系统「减少动效」与 data-motion=reduced 下都会停掉', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(":root[data-motion='reduced']");
  });

  it('装饰效果各有独立的 data-fx-off 开关：paper / drift', () => {
    for (const fx of ['paper', 'drift']) {
      expect(css, fx).toContain(`:root[data-fx-off~='${fx}']`);
    }
  });

  it('骰子是圆的', () => {
    const rule = css.match(/\.ms-die\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toContain('border-radius: 50%');
  });

  it('不使用层级调色，也不借用别的主题的特效开关', () => {
    expect(css).not.toContain('data-tint-layer');
    for (const fx of ['rain', 'scan', 'desat', 'grid', 'maze']) {
      expect(css, fx).not.toContain(`data-fx-off~='${fx}'`);
    }
  });

  it('竖排只在中文界面用：唯一的 writing-mode 规则带 :lang(zh)，英文下层签保持横排', () => {
    expect(css.match(/writing-mode/g)).toHaveLength(1);
    expect(css).toMatch(/:lang\(zh\)[^{]*\{[^}]*writing-mode:\s*vertical-rl/);
  });

  it('关键帧由基础样式提供，皮肤只引用', () => {
    expect(css).not.toContain('@keyframes');
    for (const name of ['ms-breath', 'ms-drift', 'ms-flutter']) {
      expect(baseCss).toContain(`@keyframes ${name}`);
      expect(css).toContain(name);
    }
  });

  it('楷体只有一个字重：不合成粗体', () => {
    expect(css).toContain('font-synthesis-weight: none');
  });
});

describe('主题自带字体', () => {
  it('只有「庄周梦蝶」带按需加载字体的函数，别的主题没有', () => {
    for (const id of THEME_IDS) {
      const loadFonts = getSkin(id).loadFonts;
      if (id === 'butterfly') expect(typeof loadFonts, id).toBe('function');
      else expect(loadFonts, id).toBeUndefined();
    }
  });

  it('字体样式不在任何静态样式表里：index.css 不 @import 楷体，皮肤样式不声明字体', () => {
    expect(indexCss).not.toMatch(/@import[^;]*lxgw/i);
    for (const [file, css] of Object.entries(skinCss)) {
      expect(css, file).not.toMatch(/@import|@font-face|lxgw/i);
    }
  });
});
