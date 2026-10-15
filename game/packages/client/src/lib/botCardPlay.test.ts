import { describe, it, expect } from 'vitest';
import { BOT_STEP_MS, readBotCardPlay, readBotStepMs } from './botCardPlay';

describe('readBotCardPlay', () => {
  it('缺省打开', () => {
    expect(readBotCardPlay('')).toBe(true);
    expect(readBotCardPlay('?seed=a')).toBe(true);
  });

  it('只有 botplay=off 关闭', () => {
    expect(readBotCardPlay('?botplay=off')).toBe(false);
    expect(readBotCardPlay(new URLSearchParams({ botplay: 'off', seed: 'x' }))).toBe(false);
  });

  it('其他取值一律当作打开', () => {
    expect(readBotCardPlay('?botplay=on')).toBe(true);
    expect(readBotCardPlay('?botplay=0')).toBe(true);
    expect(readBotCardPlay('?botplay=')).toBe(true);
  });
});

describe('readBotStepMs', () => {
  it('缺省按 BOT_STEP_MS 的节奏走', () => {
    expect(BOT_STEP_MS).toBeGreaterThanOrEqual(500);
    expect(readBotStepMs('')).toBe(BOT_STEP_MS);
    expect(readBotStepMs('?seed=a&botpace=slow')).toBe(BOT_STEP_MS);
  });

  it('只有 botpace=fast 不等', () => {
    expect(readBotStepMs('?botpace=fast')).toBe(0);
    expect(readBotStepMs(new URLSearchParams({ seed: 'x', botpace: 'fast' }))).toBe(0);
  });
});
