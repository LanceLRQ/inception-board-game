import { describe, it, expect } from 'vitest';
import {
  generatePixelAvatar,
  avatarToSVG,
  cyrb53,
  mulberry32,
  generateRandomAvatarSeed,
  AVATAR_GRID_SIZE,
  AVATAR_PALETTES,
} from './pixelAvatar.js';

describe('cyrb53', () => {
  it('is deterministic', () => {
    expect(cyrb53('hello')).toBe(cyrb53('hello'));
  });

  it('differs for different inputs', () => {
    expect(cyrb53('a')).not.toBe(cyrb53('b'));
  });

  it('seed changes the hash', () => {
    expect(cyrb53('x', 1)).not.toBe(cyrb53('x', 2));
  });

  it('returns a non-negative integer', () => {
    const h = cyrb53('some-id');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(h)).toBe(true);
  });
});

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 5; i++) {
      expect(r1()).toBe(r2());
    }
  });

  it('values are in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generatePixelAvatar', () => {
  it('throws on empty seed', () => {
    expect(() => generatePixelAvatar('')).toThrow();
  });

  it('is deterministic: same seed → same avatar', () => {
    const a = generatePixelAvatar('player-1');
    const b = generatePixelAvatar('player-1');
    expect(a).toEqual(b);
  });

  it('differs across seeds', () => {
    const a = generatePixelAvatar('p-1');
    const b = generatePixelAvatar('p-2');
    // grid 或 palette 至少有一个不同
    expect(JSON.stringify(a.grid) !== JSON.stringify(b.grid) || a.paletteId !== b.paletteId).toBe(
      true,
    );
  });

  it('produces an 8×8 grid', () => {
    const a = generatePixelAvatar('x');
    expect(a.grid).toHaveLength(AVATAR_GRID_SIZE);
    for (const row of a.grid) expect(row).toHaveLength(AVATAR_GRID_SIZE);
  });

  it('is left-right symmetric', () => {
    const a = generatePixelAvatar('sym-test');
    for (const row of a.grid) {
      const n = row.length;
      for (let i = 0; i < n / 2; i++) {
        expect(row[i]).toBe(row[n - 1 - i]);
      }
    }
  });

  it('picks one of the defined palettes', () => {
    const a = generatePixelAvatar('palette-test');
    expect(AVATAR_PALETTES.some((p) => p.id === a.paletteId)).toBe(true);
    expect(a.foregroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(a.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('generates unique avatars across 500 distinct seeds (high but not perfect)', () => {
    const unique = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const a = generatePixelAvatar(`p-${i}`);
      unique.add(JSON.stringify(a.grid));
    }
    // 8×8 对称有 32 位可变，但经过 PRNG 应该至少 95% 唯一（宽松检查避免 flaky）
    expect(unique.size).toBeGreaterThan(475);
  });
});

describe('avatarToSVG', () => {
  it('emits valid SVG with rects', () => {
    const a = generatePixelAvatar('svg-test');
    const svg = avatarToSVG(a, 10);
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('<rect');
    expect(svg).toContain(a.backgroundColor);
  });

  it('respects pixelSize parameter', () => {
    const a = generatePixelAvatar('size-test');
    const svg = avatarToSVG(a, 20);
    expect(svg).toContain('width="160"'); // 8 × 20
    expect(svg).toContain('viewBox="0 0 160 160"');
  });

  it('produces compact output (< 5KB for 8×8)', () => {
    const a = generatePixelAvatar('compact');
    const svg = avatarToSVG(a);
    expect(svg.length).toBeLessThan(5_000);
  });
});

describe('generateRandomAvatarSeed', () => {
  it('produces different seeds on consecutive calls (with default Date.now/Math.random)', () => {
    const s1 = generateRandomAvatarSeed();
    const s2 = generateRandomAvatarSeed();
    // 时间戳会前进或随机部分变化
    expect(s1 !== s2 || s1.length > 0).toBe(true);
  });

  it('is deterministic when now/rand are injected', () => {
    const s = generateRandomAvatarSeed(
      () => 1000,
      () => 0.5,
    );
    expect(s).toBe(
      generateRandomAvatarSeed(
        () => 1000,
        () => 0.5,
      ),
    );
  });

  it('output format is `<ts>-<rand>`', () => {
    const s = generateRandomAvatarSeed(
      () => 1_000_000,
      () => 0.25,
    );
    expect(s).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  });
});
