// AudioManager - MVP 音效管理
// 对照：plans/design/06-frontend-design.md §6.19.5（音效约定）
//
// 设计要点：
//   - 纯函数（clampVolume / computeEffectiveVolume）便于单测
//   - 懒加载 + 实例缓存：首次 play 触发构造 HTMLAudioElement
//   - 失败不阻断：音频文件 404 只记 warn，不抛
//   - mute 时不播放；volume 范围 [0, 1]
//   - prefers-reduced-motion 时保留音效（仅动画降级）

export type SoundKey = 'dice-start' | 'dice-land' | 'victory' | 'defeat';

export const SOUND_CATALOG: Readonly<Record<SoundKey, string>> = {
  'dice-start': '/sfx/dice-start.mp3',
  'dice-land': '/sfx/dice-land.mp3',
  victory: '/sfx/victory.mp3',
  defeat: '/sfx/defeat.mp3',
};

/** 把输入音量 clamp 到 [0, 1] */
export function clampVolume(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** 有效音量：mute 时返回 0，否则返回 clamp 后的 volume */
export function computeEffectiveVolume(opts: {
  readonly volume: number;
  readonly muted: boolean;
}): number {
  if (opts.muted) return 0;
  return clampVolume(opts.volume);
}

/** 有效音量 > 0 才需要真正播放 */
export function shouldPlay(opts: { readonly volume: number; readonly muted: boolean }): boolean {
  return computeEffectiveVolume(opts) > 0;
}

// === 副作用类 ===

/** 工厂：默认造 HTMLAudioElement；测试时可注入桩 */
export type AudioFactory = (url: string) => HTMLAudioElement;

const defaultFactory: AudioFactory = (url) => {
  const el = new Audio(url);
  el.preload = 'auto';
  return el;
};

export class AudioManager {
  private readonly cache = new Map<SoundKey, HTMLAudioElement>();
  private readonly factory: AudioFactory;
  private readonly warnFn: (msg: string, err?: unknown) => void;

  constructor(
    opts: {
      readonly factory?: AudioFactory;
      readonly warn?: (msg: string, err?: unknown) => void;
    } = {},
  ) {
    this.factory = opts.factory ?? defaultFactory;
    this.warnFn = opts.warn ?? ((msg, err) => console.warn('[audio]', msg, err ?? ''));
  }

  /** 懒加载：返回缓存实例；首次会构造 */
  getElement(key: SoundKey): HTMLAudioElement {
    let el = this.cache.get(key);
    if (!el) {
      el = this.factory(SOUND_CATALOG[key]);
      this.cache.set(key, el);
    }
    return el;
  }

  /**
   * 播放指定 key 的音效。
   * 若 muted 或 volume=0 则 no-op；
   * 若 play() 被浏览器拒绝（未交互过）则仅记 warn。
   */
  play(key: SoundKey, opts: { readonly volume: number; readonly muted: boolean }): void {
    if (!shouldPlay(opts)) return;
    try {
      const el = this.getElement(key);
      el.volume = computeEffectiveVolume(opts);
      // 重新从头播放（支持快速连点）
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch((err) => this.warnFn(`play ${key} failed`, err));
      }
    } catch (err) {
      this.warnFn(`play ${key} threw`, err);
    }
  }

  /** 单元测试/卸载用：释放所有元素 */
  dispose(): void {
    for (const el of this.cache.values()) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
    this.cache.clear();
  }

  /** 只读：已缓存的 key 集合 */
  get cachedKeys(): readonly SoundKey[] {
    return [...this.cache.keys()];
  }
}

// 默认单例（浏览器环境下直接使用）
let singleton: AudioManager | null = null;
export function getAudioManager(): AudioManager {
  if (!singleton) singleton = new AudioManager();
  return singleton;
}
