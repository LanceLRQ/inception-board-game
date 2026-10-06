import { describe, expect, it } from 'vitest';
import { formatSavedAt } from './formatSavedAt';

const at = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo - 1, d, h, mi).getTime();

describe('formatSavedAt', () => {
  it('当天只显示时分', () => {
    const text = formatSavedAt(at(2026, 10, 6, 9, 5), at(2026, 10, 6, 20, 0), 'en');
    expect(text).toMatch(/9:05/);
    expect(text).not.toMatch(/10\/6|Oct/);
  });

  it('其他日子带上月日', () => {
    const text = formatSavedAt(at(2026, 10, 4, 21, 30), at(2026, 10, 6, 8, 0), 'en');
    expect(text).toMatch(/10\/4/);
    expect(text).toMatch(/9:30/);
  });

  it('不认识的语言标签退回默认格式，不抛错', () => {
    expect(() =>
      formatSavedAt(at(2026, 10, 4, 21, 30), at(2026, 10, 6, 8, 0), 'zz-@@'),
    ).not.toThrow();
  });
});
