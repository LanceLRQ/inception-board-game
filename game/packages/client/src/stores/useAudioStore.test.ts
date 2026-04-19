import { describe, it, expect } from 'vitest';
import { parsePrefs, DEFAULT_VOLUME, DEFAULT_MUTED } from './useAudioStore.js';

describe('parsePrefs', () => {
  it('returns defaults for null', () => {
    expect(parsePrefs(null)).toEqual({ volume: DEFAULT_VOLUME, muted: DEFAULT_MUTED });
  });

  it('returns defaults for empty string', () => {
    expect(parsePrefs('')).toEqual({ volume: DEFAULT_VOLUME, muted: DEFAULT_MUTED });
  });

  it('returns defaults on malformed JSON', () => {
    expect(parsePrefs('not json')).toEqual({ volume: DEFAULT_VOLUME, muted: DEFAULT_MUTED });
  });

  it('clamps volume out of range', () => {
    expect(parsePrefs(JSON.stringify({ volume: 2, muted: false })).volume).toBe(1);
    expect(parsePrefs(JSON.stringify({ volume: -5, muted: false })).volume).toBe(0);
  });

  it('parses valid prefs verbatim', () => {
    expect(parsePrefs(JSON.stringify({ volume: 0.5, muted: true }))).toEqual({
      volume: 0.5,
      muted: true,
    });
  });

  it('falls back to default for non-number volume', () => {
    expect(parsePrefs(JSON.stringify({ volume: 'loud' })).volume).toBe(DEFAULT_VOLUME);
  });

  it('falls back to default for non-boolean muted', () => {
    expect(parsePrefs(JSON.stringify({ muted: 'yes' })).muted).toBe(DEFAULT_MUTED);
  });
});
