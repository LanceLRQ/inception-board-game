import { describe, expect, it } from 'vitest';
import {
  ALL_FX_NAMES,
  DEFAULT_EFFECT_PREFS,
  EFFECTS,
  EFFECT_KEYS,
  MOTION_PREFS,
  effectsForTheme,
  fxOffAttribute,
  motionAttribute,
  motionConfigMode,
  parseEffectPrefs,
  resolveReducedMotion,
  serializeEffectPrefs,
  setEffectOn,
  setMotionPref,
  isEffectOn,
} from './effects';
import { THEME_IDS } from './themes';

const skinCss = import.meta.glob('../styles/skins/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** 某个主题的皮肤样式里出现过的 data-fx-off 名字 */
function fxNamesUsedBy(themeId: string): Set<string> {
  const css = skinCss[`../styles/skins/${themeId}.css`]!;
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...noComments.matchAll(/data-fx-off~='([a-z]+)'/g)].map((m) => m[1]!));
}

describe('效果开关表', () => {
  it('设置页的开关总数（含减少动效）不超过六项，键不重复', () => {
    expect(EFFECTS.length + 1).toBeLessThanOrEqual(6);
    expect(new Set(EFFECT_KEYS).size).toBe(EFFECT_KEYS.length);
    expect(EFFECTS.map((e) => e.key)).toEqual([...EFFECT_KEYS]);
  });

  it('每个内部名字恰好归入一个开关', () => {
    const all = EFFECTS.flatMap((e) => [...e.fxNames]);
    expect(new Set(all).size).toBe(all.length);
    expect([...ALL_FX_NAMES].sort()).toEqual([...all].sort());
  });

  it('归类固定：背景动画 / 背景底纹 / 扫描线 / 卡图降饱和 / 层级调色', () => {
    const byKey = Object.fromEntries(EFFECTS.map((e) => [e.key, [...e.fxNames].sort()]));
    expect(byKey).toEqual({
      ambient: ['blink', 'drift', 'flow', 'rain', 'totem'],
      texture: ['grid', 'maze', 'paper'],
      scan: ['scan'],
      desat: ['desat'],
      tint: ['tint'],
    });
  });

  it('每个开关都带文案键与至少一个适用主题', () => {
    for (const e of EFFECTS) {
      expect(e.nameKey).toBe(`effects.items.${e.key}.name`);
      expect(e.descKey).toBe(`effects.items.${e.key}.desc`);
      expect(e.themes.length).toBeGreaterThan(0);
      for (const id of e.themes) expect(THEME_IDS).toContain(id);
    }
  });

  it('皮肤样式里用到的每个 data-fx-off 名字都有归属，没有未登记的名字', () => {
    for (const id of THEME_IDS) {
      for (const name of fxNamesUsedBy(id)) expect(ALL_FX_NAMES, `${id}:${name}`).toContain(name);
    }
  });

  it.each(THEME_IDS)('主题 %s 显示的开关恰好覆盖它皮肤样式里用到的名字', (id) => {
    const shown = effectsForTheme(id).flatMap((e) => [...e.fxNames]);
    const used = fxNamesUsedBy(id);
    // 开关表里的名字必须真的被该主题的样式使用，样式用到的名字必须有开关能关
    for (const name of used) expect(shown, `${id} 缺少能关闭 ${name} 的开关`).toContain(name);
    for (const e of effectsForTheme(id)) {
      expect(
        e.fxNames.some((n) => used.has(n)),
        `${id} 的开关 ${e.key} 在皮肤样式里没有任何对应效果`,
      ).toBe(true);
    }
  });

  it('各主题可见的开关', () => {
    const keys = (id: string) => effectsForTheme(id as never).map((e) => e.key);
    expect(keys('noir')).toEqual([]);
    expect(keys('blueprint')).toEqual(['ambient', 'texture']);
    expect(keys('totem')).toEqual(['ambient', 'texture', 'tint']);
    expect(keys('matrix')).toEqual(['ambient', 'scan', 'desat']);
    expect(keys('butterfly')).toEqual(['ambient', 'texture']);
  });
});

describe('偏好的解析与序列化', () => {
  it('缺省：所有效果开启，减少动效跟随系统', () => {
    expect(DEFAULT_EFFECT_PREFS).toEqual({ off: [], motion: 'system' });
    expect(parseEffectPrefs(null)).toEqual(DEFAULT_EFFECT_PREFS);
    expect(parseEffectPrefs('')).toEqual(DEFAULT_EFFECT_PREFS);
  });

  it.each([
    'not json',
    'null',
    '42',
    '"scan"',
    '[]',
    '{"off":"scan"}',
    '{"off":null,"motion":7}',
    '{"motion":"sideways"}',
    '{"off":["__proto__","toString",3,null]}',
  ])('无效值 %s 回落到缺省，不抛错', (raw) => {
    expect(parseEffectPrefs(raw)).toEqual(DEFAULT_EFFECT_PREFS);
  });

  it('非字符串输入也回落到缺省', () => {
    expect(parseEffectPrefs(undefined)).toEqual(DEFAULT_EFFECT_PREFS);
    expect(parseEffectPrefs(123)).toEqual(DEFAULT_EFFECT_PREFS);
  });

  it('过滤未知的键、去重、并按固定顺序排列', () => {
    const p = parseEffectPrefs(
      JSON.stringify({ off: ['tint', 'bogus', 'ambient', 'tint'], motion: 'reduce' }),
    );
    expect(p).toEqual({ off: ['ambient', 'tint'], motion: 'reduce' });
  });

  it('合法的减少动效三态', () => {
    for (const m of MOTION_PREFS) {
      expect(parseEffectPrefs(JSON.stringify({ off: [], motion: m })).motion).toBe(m);
    }
  });

  it('序列化后再解析得到同一份偏好', () => {
    const p = { off: ['texture', 'scan'] as const, motion: 'full' as const };
    expect(parseEffectPrefs(serializeEffectPrefs(p))).toEqual({
      off: ['texture', 'scan'],
      motion: 'full',
    });
  });
});

describe('偏好的修改', () => {
  it('关闭与重新开启一个效果', () => {
    const off = setEffectOn(DEFAULT_EFFECT_PREFS, 'scan', false);
    expect(off.off).toEqual(['scan']);
    expect(isEffectOn(off, 'scan')).toBe(false);
    expect(isEffectOn(off, 'desat')).toBe(true);
    const back = setEffectOn(off, 'scan', true);
    expect(back).toEqual(DEFAULT_EFFECT_PREFS);
  });

  it('重复关闭同一项不会产生重复；关闭顺序不影响结果', () => {
    const a = setEffectOn(setEffectOn(DEFAULT_EFFECT_PREFS, 'tint', false), 'ambient', false);
    const b = setEffectOn(setEffectOn(DEFAULT_EFFECT_PREFS, 'ambient', false), 'tint', false);
    expect(a).toEqual(b);
    expect(setEffectOn(a, 'tint', false)).toEqual(a);
  });

  it('不修改传入的对象', () => {
    const before = { off: ['scan'], motion: 'system' } as const;
    const snapshot = JSON.stringify(before);
    setEffectOn(before, 'tint', false);
    setMotionPref(before, 'reduce');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('设置减少动效', () => {
    expect(setMotionPref(DEFAULT_EFFECT_PREFS, 'reduce').motion).toBe('reduce');
  });
});

describe('写到根元素的属性', () => {
  it('data-fx-off：没有关闭项时为空串（调用方据此移除属性）', () => {
    expect(fxOffAttribute(DEFAULT_EFFECT_PREFS)).toBe('');
  });

  it('data-fx-off：关闭一个开关就写出它包含的全部内部名字，空格分隔', () => {
    expect(fxOffAttribute({ off: ['ambient'], motion: 'system' })).toBe(
      'rain totem flow blink drift',
    );
    expect(fxOffAttribute({ off: ['texture', 'scan'], motion: 'system' })).toBe(
      'grid maze paper scan',
    );
    expect(fxOffAttribute({ off: ['desat', 'tint'], motion: 'system' })).toBe('desat tint');
  });

  it('data-motion：跟随系统不写属性，总是减少写 reduced，不减少写 full', () => {
    expect(motionAttribute(DEFAULT_EFFECT_PREFS)).toBeNull();
    expect(motionAttribute({ off: [], motion: 'reduce' })).toBe('reduced');
    expect(motionAttribute({ off: [], motion: 'full' })).toBe('full');
  });
});

describe('减少动效在脚本侧的判定', () => {
  it('跟随系统时看系统偏好；总是减少恒为真；不减少恒为假', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
    expect(resolveReducedMotion('reduce', false)).toBe(true);
    expect(resolveReducedMotion('full', true)).toBe(false);
  });

  it('framer-motion 的配置：system→user，reduce→always，full→never', () => {
    expect(motionConfigMode('system')).toBe('user');
    expect(motionConfigMode('reduce')).toBe('always');
    expect(motionConfigMode('full')).toBe('never');
  });
});
