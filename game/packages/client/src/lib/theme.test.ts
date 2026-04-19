import { describe, it, expect } from 'vitest';
import {
  resolveTheme,
  isValidThemePreference,
  cycleTheme,
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
} from './theme';

describe('resolveTheme', () => {
  it('returns explicit light/dark regardless of system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows system preference when pref is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('isValidThemePreference', () => {
  it('accepts light/dark/system', () => {
    expect(isValidThemePreference('light')).toBe(true);
    expect(isValidThemePreference('dark')).toBe(true);
    expect(isValidThemePreference('system')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isValidThemePreference('')).toBe(false);
    expect(isValidThemePreference('unknown')).toBe(false);
    expect(isValidThemePreference(null)).toBe(false);
    expect(isValidThemePreference(undefined)).toBe(false);
    expect(isValidThemePreference(42)).toBe(false);
    expect(isValidThemePreference({})).toBe(false);
  });
});

describe('cycleTheme', () => {
  it('light → dark → system → light', () => {
    expect(cycleTheme('light')).toBe('dark');
    expect(cycleTheme('dark')).toBe('system');
    expect(cycleTheme('system')).toBe('light');
  });

  it('full cycle returns to start after 3 steps', () => {
    const start: ReturnType<typeof cycleTheme> = 'light';
    expect(cycleTheme(cycleTheme(cycleTheme(start)))).toBe(start);
  });
});

describe('constants', () => {
  it('default preference is system (follows OS)', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');
  });

  it('storage key is stable', () => {
    expect(THEME_STORAGE_KEY).toBe('icgame-theme');
  });
});
