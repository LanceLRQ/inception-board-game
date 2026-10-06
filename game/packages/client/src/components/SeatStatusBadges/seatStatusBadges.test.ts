// 座位状态标识的图标与配色映射

import { describe, it, expect } from 'vitest';
import { Bot, UserCog, WifiOff } from 'lucide-react';
import { MARKER_ICON, MARKER_COLOR_CLASS } from './index';
import type { SeatMarker } from '../MatchRuntime/seatMarkers';

const ALL: SeatMarker[] = ['bot', 'offline', 'taken_over', 'idle_takeover'];

describe('SeatStatusBadges 映射', () => {
  it('每种标识对应的 lucide 图标', () => {
    expect(MARKER_ICON.bot).toBe(Bot);
    expect(MARKER_ICON.offline).toBe(WifiOff);
    expect(MARKER_ICON.taken_over).toBe(UserCog);
    expect(MARKER_ICON.idle_takeover).toBe(UserCog);
  });

  it('每种标识都有配色，且「人不在」类标识比 bot 醒目', () => {
    for (const m of ALL) expect(MARKER_COLOR_CLASS[m]).toBeTruthy();
    expect(MARKER_COLOR_CLASS.bot).toBe('text-muted-foreground');
    for (const m of ['offline', 'taken_over', 'idle_takeover'] as const) {
      expect(MARKER_COLOR_CLASS[m]).not.toBe(MARKER_COLOR_CLASS.bot);
    }
  });
});
