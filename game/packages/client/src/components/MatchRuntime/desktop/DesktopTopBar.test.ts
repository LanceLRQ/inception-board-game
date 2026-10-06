import { describe, it, expect } from 'vitest';
import { shortMatchId } from './DesktopTopBar';

describe('shortMatchId', () => {
  it('只取前 8 位并转大写', () => {
    expect(shortMatchId('abcdef0123456789')).toBe('ABCDEF01');
  });

  it('短编号原样保留，没有编号为空串', () => {
    expect(shortMatchId('m1')).toBe('M1');
    expect(shortMatchId(undefined)).toBe('');
    expect(shortMatchId('')).toBe('');
  });
});
