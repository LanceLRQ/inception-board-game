// 效果开关表：面向用户的装饰效果开关，与「减少动效」三态的偏好数据
//
// 皮肤样式里的装饰效果各有一个内部名字，写成 `:root[data-fx-off~='<名字>']` 来单独关闭。
// 用户看到的开关按「效果类别」归类，一个开关背后可以包含多个内部名字。
// 偏好写到 <html> 的 data-fx-off（空格分隔的内部名字）与 data-motion。
//
// 新增一个效果名的步骤见根 CLAUDE.md「层级调色的钩子」一段。
// effects.test.ts 会拿本表与各皮肤样式里实际出现的 data-fx-off 名字对账，漏登记或登记错主题都会失败。

import type { ThemeId } from './themes';

/** localStorage 键名 */
export const EFFECTS_STORAGE_KEY = 'icgame-effects';

export const EFFECT_KEYS = ['ambient', 'texture', 'scan', 'desat', 'tint'] as const;

export type EffectKey = (typeof EFFECT_KEYS)[number];

export interface EffectDefinition {
  readonly key: EffectKey;
  /** 开关名的 i18n 键 */
  readonly nameKey: string;
  /** 一句话说明的 i18n 键 */
  readonly descKey: string;
  /** 该开关关闭时写进 data-fx-off 的内部名字（顺序即属性里的顺序） */
  readonly fxNames: readonly string[];
  /** 用得到该开关的主题；设置页只对这些主题显示它 */
  readonly themes: readonly ThemeId[];
}

function define(
  key: EffectKey,
  fxNames: readonly string[],
  themes: readonly ThemeId[],
): EffectDefinition {
  return {
    key,
    nameKey: `effects.items.${key}.name`,
    descKey: `effects.items.${key}.desc`,
    fxNames,
    themes,
  };
}

/**
 * 开关表：
 * - ambient 背景动画：rain 数字雨（矩阵）、totem 陀螺自旋与微晃（蓝图、陀螺）、flow 穿层虚线流动（蓝图、陀螺）、
 *   blink 光标与状态灯明灭（矩阵）、drift 蝶的漂移扇动与墨点呼吸（蝶）
 * - texture 背景底纹（静态）：grid 制图网格（蓝图）、maze 迷宫（陀螺）、paper 纸纹（蝶）
 * - scan 扫描线（矩阵）· desat 卡图降饱和（矩阵）· tint 层级调色（陀螺）
 */
export const EFFECTS: readonly EffectDefinition[] = [
  define(
    'ambient',
    ['rain', 'totem', 'flow', 'blink', 'drift'],
    ['blueprint', 'totem', 'matrix', 'butterfly'],
  ),
  define('texture', ['grid', 'maze', 'paper'], ['blueprint', 'totem', 'butterfly']),
  define('scan', ['scan'], ['matrix']),
  define('desat', ['desat'], ['matrix']),
  define('tint', ['tint'], ['totem']),
];

/** 全部内部名字 */
export const ALL_FX_NAMES: readonly string[] = EFFECTS.flatMap((e) => [...e.fxNames]);

/** 某个主题用得到的开关（按表内顺序） */
export function effectsForTheme(themeId: ThemeId): readonly EffectDefinition[] {
  return EFFECTS.filter((e) => e.themes.includes(themeId));
}

/** 减少动效：跟随系统（缺省）/ 总是减少 / 不减少 */
export const MOTION_PREFS = ['system', 'reduce', 'full'] as const;

export type MotionPref = (typeof MOTION_PREFS)[number];

export interface EffectPrefs {
  /** 被用户关掉的开关，按 EFFECT_KEYS 的顺序、不重复 */
  readonly off: readonly EffectKey[];
  readonly motion: MotionPref;
}

export const DEFAULT_EFFECT_PREFS: EffectPrefs = { off: [], motion: 'system' };

const isEffectKey = (v: unknown): v is EffectKey =>
  typeof v === 'string' && (EFFECT_KEYS as readonly string[]).includes(v);

const isMotionPref = (v: unknown): v is MotionPref =>
  typeof v === 'string' && (MOTION_PREFS as readonly string[]).includes(v);

/** 按固定顺序、去重 */
function normalizeOff(keys: readonly EffectKey[]): readonly EffectKey[] {
  return EFFECT_KEYS.filter((k) => keys.includes(k));
}

/** 解析 localStorage 里的偏好；无效值（含不是字符串、坏 JSON、未知键）逐项回落到缺省，绝不抛错 */
export function parseEffectPrefs(raw: unknown): EffectPrefs {
  if (typeof raw !== 'string' || raw === '') return DEFAULT_EFFECT_PREFS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_EFFECT_PREFS;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return DEFAULT_EFFECT_PREFS;
  }
  const rec = data as Record<string, unknown>;
  const off = Array.isArray(rec['off']) ? normalizeOff(rec['off'].filter(isEffectKey)) : [];
  const motion = isMotionPref(rec['motion']) ? rec['motion'] : DEFAULT_EFFECT_PREFS.motion;
  return { off, motion };
}

export function serializeEffectPrefs(prefs: EffectPrefs): string {
  return JSON.stringify({ off: [...prefs.off], motion: prefs.motion });
}

export function isEffectOn(prefs: EffectPrefs, key: EffectKey): boolean {
  return !prefs.off.includes(key);
}

export function setEffectOn(prefs: EffectPrefs, key: EffectKey, on: boolean): EffectPrefs {
  const rest = prefs.off.filter((k) => k !== key);
  return { ...prefs, off: normalizeOff(on ? rest : [...rest, key]) };
}

export function setMotionPref(prefs: EffectPrefs, motion: MotionPref): EffectPrefs {
  return { ...prefs, motion };
}

/** data-fx-off 的取值；没有关闭项时为空串，调用方应移除属性 */
export function fxOffAttribute(prefs: EffectPrefs): string {
  return EFFECTS.filter((e) => prefs.off.includes(e.key))
    .flatMap((e) => [...e.fxNames])
    .join(' ');
}

/** data-motion 的取值：总是减少 → reduced，不减少 → full，跟随系统 → null（不写属性，交给媒体查询） */
export function motionAttribute(prefs: EffectPrefs): 'reduced' | 'full' | null {
  if (prefs.motion === 'reduce') return 'reduced';
  if (prefs.motion === 'full') return 'full';
  return null;
}

/** 脚本侧（不是样式）是否应当减少动效 */
export function resolveReducedMotion(pref: MotionPref, systemReduced: boolean): boolean {
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  return systemReduced;
}

/** framer-motion 的 MotionConfig.reducedMotion 取值 */
export function motionConfigMode(pref: MotionPref): 'user' | 'always' | 'never' {
  if (pref === 'reduce') return 'always';
  if (pref === 'full') return 'never';
  return 'user';
}
