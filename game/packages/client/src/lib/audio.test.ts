import { describe, it, expect, vi } from 'vitest';
import {
  AudioManager,
  SOUND_CATALOG,
  clampVolume,
  computeEffectiveVolume,
  shouldPlay,
} from './audio.js';

describe('clampVolume', () => {
  it('clamps values into [0, 1]', () => {
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(1)).toBe(1);
    expect(clampVolume(-0.2)).toBe(0);
    expect(clampVolume(5)).toBe(1);
  });

  it('treats NaN as 0', () => {
    expect(clampVolume(NaN)).toBe(0);
  });
});

describe('computeEffectiveVolume', () => {
  it('is 0 when muted regardless of volume', () => {
    expect(computeEffectiveVolume({ volume: 0.8, muted: true })).toBe(0);
  });

  it('is clamped volume when not muted', () => {
    expect(computeEffectiveVolume({ volume: 0.8, muted: false })).toBe(0.8);
    expect(computeEffectiveVolume({ volume: 2, muted: false })).toBe(1);
  });
});

describe('shouldPlay', () => {
  it('is false when muted', () => {
    expect(shouldPlay({ volume: 0.8, muted: true })).toBe(false);
  });

  it('is false when volume is 0', () => {
    expect(shouldPlay({ volume: 0, muted: false })).toBe(false);
  });

  it('is true when volume > 0 and not muted', () => {
    expect(shouldPlay({ volume: 0.5, muted: false })).toBe(true);
  });
});

describe('SOUND_CATALOG', () => {
  it('includes all 4 required keys with /sfx/ paths', () => {
    expect(SOUND_CATALOG['dice-start']).toBe('/sfx/dice-start.mp3');
    expect(SOUND_CATALOG['dice-land']).toBe('/sfx/dice-land.mp3');
    expect(SOUND_CATALOG.victory).toBe('/sfx/victory.mp3');
    expect(SOUND_CATALOG.defeat).toBe('/sfx/defeat.mp3');
  });
});

// --- AudioManager ---

interface FakeAudio {
  src: string;
  volume: number;
  currentTime: number;
  preload: string;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
}

function makeFakeAudioFactory(opts: { playShouldReject?: boolean } = {}) {
  const created: FakeAudio[] = [];
  const factory = (url: string): HTMLAudioElement => {
    const el: FakeAudio = {
      src: url,
      volume: 1,
      currentTime: 0,
      preload: '',
      play: vi.fn(() =>
        opts.playShouldReject ? Promise.reject(new Error('no gesture')) : Promise.resolve(),
      ),
      pause: vi.fn(),
    };
    created.push(el);
    return el as unknown as HTMLAudioElement;
  };
  return { factory, created };
}

describe('AudioManager', () => {
  it('is a no-op when muted', () => {
    const { factory, created } = makeFakeAudioFactory();
    const m = new AudioManager({ factory });
    m.play('dice-start', { volume: 1, muted: true });
    expect(created.length).toBe(0);
  });

  it('is a no-op when volume is 0', () => {
    const { factory, created } = makeFakeAudioFactory();
    const m = new AudioManager({ factory });
    m.play('dice-land', { volume: 0, muted: false });
    expect(created.length).toBe(0);
  });

  it('lazy-creates HTMLAudioElement on first play', () => {
    const { factory, created } = makeFakeAudioFactory();
    const m = new AudioManager({ factory });
    m.play('dice-start', { volume: 0.8, muted: false });
    expect(created.length).toBe(1);
    expect(created[0]!.src).toBe('/sfx/dice-start.mp3');
    expect(created[0]!.volume).toBeCloseTo(0.8);
    expect(created[0]!.play).toHaveBeenCalledTimes(1);
  });

  it('reuses cached element on subsequent plays of the same key', () => {
    const { factory, created } = makeFakeAudioFactory();
    const m = new AudioManager({ factory });
    m.play('dice-start', { volume: 1, muted: false });
    m.play('dice-start', { volume: 0.5, muted: false });
    expect(created.length).toBe(1);
    expect(created[0]!.play).toHaveBeenCalledTimes(2);
    // 第二次播应该已设成 0.5
    expect(created[0]!.volume).toBeCloseTo(0.5);
  });

  it('rewinds currentTime to 0 before each play (supports rapid re-play)', () => {
    const { factory, created } = makeFakeAudioFactory();
    const m = new AudioManager({ factory });
    m.play('dice-start', { volume: 1, muted: false });
    created[0]!.currentTime = 0.15;
    m.play('dice-start', { volume: 1, muted: false });
    expect(created[0]!.currentTime).toBe(0);
  });

  it('does not throw when play() rejects (browser autoplay policy)', async () => {
    const warn = vi.fn();
    const { factory, created } = makeFakeAudioFactory({ playShouldReject: true });
    const m = new AudioManager({ factory, warn });
    expect(() => m.play('victory', { volume: 1, muted: false })).not.toThrow();
    // 等 microtask queue
    await new Promise((r) => setImmediate(r));
    expect(created[0]!.play).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('dispose() clears cache and pauses elements', () => {
    const { factory, created } = makeFakeAudioFactory();
    const m = new AudioManager({ factory });
    m.play('dice-start', { volume: 1, muted: false });
    m.play('victory', { volume: 1, muted: false });
    expect(m.cachedKeys.length).toBe(2);
    m.dispose();
    expect(m.cachedKeys.length).toBe(0);
    expect(created[0]!.pause).toHaveBeenCalled();
    expect(created[1]!.pause).toHaveBeenCalled();
  });
});
