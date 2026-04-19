import { describe, it, expect } from 'vitest';
import { formatBytes, computePercent } from './index';

describe('formatBytes', () => {
  it('formats under 1 KB as bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats KB with one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats MB with one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});

describe('computePercent', () => {
  it('returns 0 when total is 0', () => {
    expect(computePercent({ loaded: 0, total: 0 })).toBe(0);
    expect(computePercent({ loaded: 5, total: 0 })).toBe(0); // divide-by-zero guard
  });

  it('computes correct rounded percentage', () => {
    expect(computePercent({ loaded: 1, total: 4 })).toBe(25);
    expect(computePercent({ loaded: 2, total: 3 })).toBe(67);
    expect(computePercent({ loaded: 50, total: 100 })).toBe(50);
  });

  it('caps at 100 even if loaded > total', () => {
    expect(computePercent({ loaded: 200, total: 100 })).toBe(100);
  });
});
