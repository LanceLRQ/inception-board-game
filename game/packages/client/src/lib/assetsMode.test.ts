import { describe, it, expect } from 'vitest';
import { normalizeAssetsMode } from './assetsMode.js';

describe('normalizeAssetsMode', () => {
  it('returns placeholder only for "placeholder" (case-insensitive)', () => {
    expect(normalizeAssetsMode('placeholder')).toBe('placeholder');
    expect(normalizeAssetsMode('Placeholder')).toBe('placeholder');
    expect(normalizeAssetsMode('  PLACEHOLDER  ')).toBe('placeholder');
  });

  it('returns normal for undefined / empty / other values', () => {
    expect(normalizeAssetsMode(undefined)).toBe('normal');
    expect(normalizeAssetsMode('')).toBe('normal');
    expect(normalizeAssetsMode('normal')).toBe('normal');
    expect(normalizeAssetsMode('anything-else')).toBe('normal');
  });
});
