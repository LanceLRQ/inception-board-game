import { describe, expect, it } from 'vitest';
import {
  MATCH_MAX_PLAYERS,
  MATCH_MIN_PLAYERS,
  isMatchPlayerCount,
  playersShortOfMinimum,
} from './playerCount.js';

describe('对局人数范围', () => {
  it('范围是 4–10（3 人局尚未支持）', () => {
    expect(MATCH_MIN_PLAYERS).toBe(4);
    expect(MATCH_MAX_PLAYERS).toBe(10);
  });

  it('isMatchPlayerCount：边界与非整数', () => {
    expect(isMatchPlayerCount(3)).toBe(false);
    expect(isMatchPlayerCount(4)).toBe(true);
    expect(isMatchPlayerCount(10)).toBe(true);
    expect(isMatchPlayerCount(11)).toBe(false);
    expect(isMatchPlayerCount(4.5)).toBe(false);
    expect(isMatchPlayerCount(Number.NaN)).toBe(false);
  });

  it('playersShortOfMinimum：不足时给出差额，够了为 0', () => {
    expect(playersShortOfMinimum(1)).toBe(3);
    expect(playersShortOfMinimum(3)).toBe(1);
    expect(playersShortOfMinimum(4)).toBe(0);
    expect(playersShortOfMinimum(9)).toBe(0);
  });
});
